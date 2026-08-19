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

    // A "Team Manager" is any signed-in user whose own profile self-declares
    // role == 'coach' and teamInfo.club == clubId. There is no separate
    // verification/approval step in this app — any user can set this on their
    // own account settings page. This rule only enforces "you claimed to
    // manage this club", not identity-verified club ownership.
    function isTeamManagerOf(clubId) {
      return isSignedIn()
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'coach'
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.teamInfo.club == clubId;
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
