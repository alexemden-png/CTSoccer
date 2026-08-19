# Firebase security rules for CT Soccer

Paste these into the Firebase Console after the project is created.

## Firestore Rules
Console → Build → Firestore Database → Rules tab → replace contents → Publish.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read: if true;
      allow create: if request.auth != null && request.auth.uid == uid;
      allow update: if request.auth != null && request.auth.uid == uid;
      allow delete: if false;
    }
    match /follows/{followId} {
      allow read: if true;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.followerUid;
      allow delete: if request.auth != null
        && request.auth.uid == resource.data.followerUid;
      allow update: if false;
    }
    match /posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.uid
        && request.resource.data.mediaType in ['image', 'video']
        && request.resource.data.caption.size() < 500;
      allow update: if false;
      allow delete: if request.auth != null && request.auth.uid == resource.data.uid;
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
