// Firebase project config — replace the placeholder values below with the
// config object from Firebase Console > Project settings > Your apps > Web app.
// These values are safe to expose client-side; access is controlled by
// Firestore/Storage security rules, not by hiding this config.
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();
const db = firebase.firestore();
// firebase-storage-compat.js is only loaded on pages that need uploads (e.g. community.html) —
// guard so pages without it (people.html, login.html, register.html) don't crash on load.
const storage = typeof firebase.storage === 'function' ? firebase.storage() : null;

// True once firebaseConfig has been filled in with real values.
const FIREBASE_READY = firebaseConfig.apiKey !== "REPLACE_ME";
