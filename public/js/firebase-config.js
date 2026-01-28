// Import Firebase SDKs from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBZIBm9qLdfk8uXNVgvhy64fa0NiFzBCsw",
    authDomain: "campus-2352e.firebaseapp.com",
    projectId: "campus-2352e",
    storageBucket: "campus-2352e.firebasestorage.app",
    messagingSenderId: "902513331241",
    appId: "1:902513331241:web:fa2836ac675be78ef0e038",
    measurementId: "G-9N7MBM8E2N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Restrict to specific hosted domain if needed (optional client hint)
googleProvider.setCustomParameters({
    hd: 'ltce.in'
});

export { app, analytics, auth, googleProvider, signInWithPopup, signOut };
