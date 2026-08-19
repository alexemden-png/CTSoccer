// Firebase project config — the config object from Firebase Console >
// Project settings > Your apps > Web app. These values are safe to expose
// client-side; access is controlled by Firestore/Storage security rules,
// not by hiding this config.
const firebaseConfig = {
  apiKey: "AIzaSyB1hLLdz_aY_tZIXXdWt9rBrfjk-6h4x9E",
  authDomain: "ct-soccer-56a24.firebaseapp.com",
  projectId: "ct-soccer-56a24",
  storageBucket: "ct-soccer-56a24.firebasestorage.app",
  messagingSenderId: "717579895633",
  appId: "1:717579895633:web:44046b18b45c14c5384970",
  measurementId: "G-15EV3SGN42"
};

firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();
const db = firebase.firestore();
// firebase-storage-compat.js is only loaded on pages that need uploads (e.g. community.html) —
// guard so pages without it (people.html, login.html, register.html) don't crash on load.
const storage = typeof firebase.storage === 'function' ? firebase.storage() : null;

// True once firebaseConfig has been filled in with real values.
const FIREBASE_READY = firebaseConfig.apiKey !== "REPLACE_ME";

// Storage (photo/video uploads) is NOT active yet — the project hasn't been
// upgraded to a billing plan that supports it. Auth + Firestore are live.
// Pages that offer uploads (community.html) must check this and show a
// "coming soon" state instead of ever calling storage.ref() while it's false.
const STORAGE_ENABLED = false;
