// Shared "Sign in with Google" orchestration for login.html and register.html.
//
// This owns the Firebase calls and the decision tree — new user vs.
// existing vs. account-linking conflict — since that logic is identical
// regardless of which page the button was clicked from. Each page supplies
// small callbacks for the UI it needs to show (role picker for a new user,
// the 2FA challenge, a password prompt to link accounts) because this is a
// plain multi-page static site with no shared component system — the
// Firebase/decision logic lives here once; the panels themselves are
// duplicated per page like everything else on this site.
//
// hooks shape:
//   onNewUser(googleUser)          -> Promise<{firstName, lastName, role}>
//     Reject/throw to cancel (the freshly-created Google auth user is
//     deleted so no orphaned account with no profile is left behind).
//   on2FANeeded(twoFactorData)     -> Promise<boolean>
//     Resolve true once a code/backup code has been verified true;
//     resolve false (or throw) to cancel.
//   onLinkPasswordNeeded(email)    -> Promise<string>
//     Resolve with the password the user entered; reject to cancel.
//   onSuccess(localUser)           -> void
//   onError(message)               -> void
//   onCancelled()                  -> void

function googleAuthProvider() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

// Best-effort split of a Google display name into first/last for
// pre-filling the new-user profile form — always shown as editable, never
// trusted as final.
function googleAuthSplitName(displayName) {
  const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
}

async function googleAuthBuildLocalUser(uid, email) {
  const doc = await db.collection('users').doc(uid).get();
  const d = doc.data() || {};
  return {
    firstName: d.firstName || '', lastName: d.lastName || '',
    email, role: d.role || 'fan',
    username: d.username || null, bio: d.bio || '', location: d.location || '',
    joined: d.joined || new Date().toISOString(),
    followedClubs: d.followedClubs || [],
    notifications: true,
    stats: d.stats || { goals: 0, assists: 0, appearances: 0, rating: '—' },
    firebaseUid: uid,
  };
}

// Same users/ + publicProfiles/ shape register.html's own signup already
// writes, so a Google-created account looks identical to a password one
// everywhere else on the site.
async function googleAuthCreateNewUserRecord(googleUser, profile) {
  const uid = googleUser.uid;
  const joined = new Date().toISOString();
  await db.collection('users').doc(uid).set({
    uid, email: googleUser.email,
    firstName: profile.firstName, lastName: profile.lastName, role: profile.role,
    username: null, bio: '', location: '',
    followerCount: 0, followingCount: 0,
    joined,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  db.collection('publicProfiles').doc(uid).set({
    firstName: profile.firstName, lastName: profile.lastName, role: profile.role,
    username: null, club: null, avatar: googleUser.photoURL || null,
    followerCount: 0, followingCount: 0,
  }).catch((err) => console.warn('[Firestore] public profile create failed:', err.message));
}

async function googleAuthHandleExisting(uid, email, hooks) {
  const doc = await db.collection('users').doc(uid).get();
  const docData = doc.data() || {};
  if (docData.twoFactor && docData.twoFactor.enabled) {
    let ok = false;
    try { ok = await hooks.on2FANeeded(docData.twoFactor); } catch (e) { ok = false; }
    if (!ok) { await fbAuth.signOut().catch(() => {}); hooks.onCancelled(); return; }
  }
  hooks.onSuccess(await googleAuthBuildLocalUser(uid, email));
}

// The standard Firebase-documented pattern for auth/account-exists-with-
// different-credential: confirm the existing password (through the same
// 2FA-aware check a normal login uses — this must not become a way to link
// a new sign-in method without proving you actually own the account), then
// link the Google credential onto it so both methods work going forward.
//
// This deliberately does NOT call fetchSignInMethodsForEmail to find out
// which provider is on file first — on projects with Email Enumeration
// Protection enabled (the default for newer Firebase projects, confirmed
// against this one via a live test run), that call always returns []
// regardless of the real answer, which would make every conflict look
// unresolvable. Since this site only offers 'password' and 'google.com' as
// providers, and this error only fires when the *other* one is already on
// file, the conflicting provider can only be password — so go straight to
// prompting for it.
async function googleAuthResolveConflict(err, hooks) {
  const email = err.email;
  const pendingCred = err.credential;

  let password;
  try { password = await hooks.onLinkPasswordNeeded(email); }
  catch (e) { hooks.onCancelled(); return; }

  let cred;
  try {
    cred = await fbAuth.signInWithEmailAndPassword(email, password);
  } catch (e) {
    hooks.onError(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
      ? 'Incorrect password.'
      : 'Could not verify: ' + e.message);
    return;
  }

  const doc = await db.collection('users').doc(cred.user.uid).get();
  const docData = doc.data() || {};
  if (docData.twoFactor && docData.twoFactor.enabled) {
    let ok = false;
    try { ok = await hooks.on2FANeeded(docData.twoFactor); } catch (e) { ok = false; }
    if (!ok) { await fbAuth.signOut().catch(() => {}); hooks.onCancelled(); return; }
  }

  await cred.user.linkWithCredential(pendingCred);
  hooks.onSuccess(await googleAuthBuildLocalUser(cred.user.uid, email));
}

async function googleAuthSignIn(hooks) {
  let result;
  try {
    result = await fbAuth.signInWithPopup(googleAuthProvider());
  } catch (err) {
    if (err.code === 'auth/account-exists-with-different-credential') {
      return googleAuthResolveConflict(err, hooks);
    }
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
      hooks.onCancelled();
      return;
    }
    hooks.onError('Google sign-in failed: ' + err.message);
    return;
  }

  const isNewUser = !!(result.additionalUserInfo && result.additionalUserInfo.isNewUser);
  const uid = result.user.uid;
  const email = result.user.email;

  if (isNewUser) {
    let profile;
    try {
      profile = await hooks.onNewUser(result.user);
    } catch (e) {
      // Cancelled before finishing their profile — don't leave a Firebase
      // Auth account behind with no matching Firestore profile.
      await result.user.delete().catch(() => fbAuth.signOut().catch(() => {}));
      hooks.onCancelled();
      return;
    }
    await googleAuthCreateNewUserRecord(result.user, profile);
    hooks.onSuccess(await googleAuthBuildLocalUser(uid, email));
    return;
  }

  await googleAuthHandleExisting(uid, email, hooks);
}
