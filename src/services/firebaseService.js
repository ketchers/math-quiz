import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, addDoc, deleteDoc, onSnapshot, query, where, getDocs } from 'firebase/firestore';

// ==================================================================================
// CONFIGURATION (EXTRACTED FROM App.jsx)
// ==================================================================================

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

export const TEACHER_EMAIL = import.meta.env.VITE_TEACHER_EMAIL || "";

// ==================================================================================
// INITIALIZATION
// ==================================================================================

export let auth;
export let db;
export const isFirebaseConfigured = !!FIREBASE_CONFIG.apiKey;

if (isFirebaseConfigured) {
  try {
    const app = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase Init Error:", e);
  }
}

// ==================================================================================
// AUTHENTICATION HOOKS & FUNCTIONS
// ==================================================================================

// Custom hook to listen to the user's authentication state
export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
        setLoading(false); 
        return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return { user, loading };
};

export const handleLogin = async () => { 
    if (!auth) return;
    try { 
        await signInWithPopup(auth, new GoogleAuthProvider()); 
    } catch (e) { 
        alert(e.message); 
    } 
};

export const handleLogout = async () => {
    if (!auth) return;
    await signOut(auth);
};

// Custom hook to fetch the list of quizzes
export const useQuizzes = (userId) => {
    const [quizzes, setQuizzes] = useState([]);
    useEffect(() => {
        if (!db || !userId) return;
        const unsub = onSnapshot(collection(db, 'quizzes'), (snap) => {
            setQuizzes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [userId]);
    return quizzes;
};

// Exporting DB functions for use in other components
export { collection, doc, setDoc, addDoc, deleteDoc, onSnapshot, query, where, getDocs };