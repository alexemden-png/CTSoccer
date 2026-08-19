# Firebase security rules for CT Soccer

Paste these into the Firebase Console after the project is created.

## Firestore Rules
Console → Build → Firestore Database → Rules tab → replace contents → Publish.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() {
      return request.auth != null;
    }

    // The one CT Soccer admin account. Checked against the auth token's email
    // claim (part of the signed, server-verified ID token — not client-supplied
    // data), so this can't be spoofed by editing a profile document or the UI.
    function isAdmin() {
      return isSignedIn() && request.auth.token.email.lower() == 'alexemden@icloud.com';
    }

    // A "Team Manager" is someone with an admin-approved managerApprovals/{uid}
    // doc for that specific club. Approval docs are admin-write-only (see below)
    // — a user can never grant this to themselves, unlike the old design where
    // this checked a self-editable field on the user's own profile.
    function isTeamManagerOf(clubId) {
      return isSignedIn()
        && get(/databases/$(database)/documents/managerApprovals/$(request.auth.uid)).data.club == clubId;
    }

    // Full profile doc — email, bio, location, teamInfo, etc. Owner-only in every
    // direction: nothing here is meant to be readable by other signed-in users.
    // The People directory reads publicProfiles/ instead, which only ever holds
    // name, role, club, and photo.
    match /users/{uid} {
      allow read: if isSignedIn() && request.auth.uid == uid;
      allow create: if isSignedIn() && request.auth.uid == uid;
      allow update: if isSignedIn() && request.auth.uid == uid;
      allow delete: if isSignedIn() && request.auth.uid == uid;
    }
    // Restricted-field mirror of users/ for the People directory — only ever
    // firstName, lastName, username, role, club, avatar, followerCount,
    // followingCount. Readable by any signed-in user; writable by the profile
    // owner, except followerCount, which any signed-in user may adjust by
    // exactly the counter needed to follow/unfollow someone else.
    match /publicProfiles/{uid} {
      allow read: if isSignedIn();
      allow create: if isSignedIn() && request.auth.uid == uid;
      allow update: if isSignedIn() && (
        request.auth.uid == uid
        || (
          request.resource.data.diff(resource.data).affectedKeys().hasOnly(['followerCount'])
          && request.resource.data.followerCount is int
          && request.resource.data.followerCount >= 0
        )
      );
      allow delete: if isSignedIn() && request.auth.uid == uid;
    }
    match /follows/{followId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn()
        && request.auth.uid == request.resource.data.followerUid;
      allow delete: if isSignedIn()
        && request.auth.uid == resource.data.followerUid;
      allow update: if false;
    }
    match /posts/{postId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn()
        && request.auth.uid == request.resource.data.uid
        && request.resource.data.mediaType in ['image', 'video']
        && request.resource.data.caption.size() < 500;
      allow update: if false;
      allow delete: if isSignedIn() && request.auth.uid == resource.data.uid;
    }
    match /matchResults/{resultId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn()
        && request.resource.data.submittedBy == request.auth.uid
        && isTeamManagerOf(request.resource.data.clubId);
      allow update: if isTeamManagerOf(resource.data.clubId);
      allow delete: if isTeamManagerOf(resource.data.clubId);
    }

    // Team Manager requests — a user can create their own pending request and
    // read it back, plus the admin can read every request (to review the queue).
    // Only the admin can change status (approve/deny) or delete a request; a
    // requester can never approve their own request or edit an existing one.
    match /managerRequests/{requestId} {
      allow read: if isSignedIn() && (request.auth.uid == resource.data.uid || isAdmin());
      allow create: if isSignedIn()
        && request.auth.uid == request.resource.data.uid
        && request.resource.data.status == 'pending';
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }

    // Approved Team Manager assignments — the actual authorization matchResults
    // checks. Deliberately admin-write-only in every direction: a user can read
    // their own approval (to know they're approved and for which club) but can
    // never create, edit, or delete it themselves — that would let anyone
    // self-approve, defeating the whole point of the approval step.
    match /managerApprovals/{uid} {
      allow read: if isSignedIn() && (request.auth.uid == uid || isAdmin());
      allow write: if isAdmin();
    }
  }
}
```

## Storage Rules
Console → Build → Storage → Rules tab → replace contents → Publish.

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /posts/{uid}/{fileName} {
      allow read: if true;
      allow write: if request.auth != null
        && request.auth.uid == uid
        && request.resource.size < 50 * 1024 * 1024
        && request.resource.contentType.matches('image/.*|video/.*');
      allow delete: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```
