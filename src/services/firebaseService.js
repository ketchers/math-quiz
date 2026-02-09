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

// Tracks a student's submissions grouped by quiz for attempts and quick retake flows.
export const useStudentSubmissions = (studentId) => {
    const [summaryByQuiz, setSummaryByQuiz] = useState({});

    useEffect(() => {
        if (!db || !studentId) return;

        const submissionsQuery = query(
            collection(db, 'submissions'),
            where('studentId', '==', studentId)
        );

        const unsub = onSnapshot(submissionsQuery, (snap) => {
            const nextSummary = {};

            snap.docs.forEach((submissionDoc) => {
                const data = submissionDoc.data();
                const quizId = data.quizId;
                if (!quizId) return;

                const attemptNumber = Number(data.attemptNumber || 0);

                if (!nextSummary[quizId]) {
                    nextSummary[quizId] = {
                        count: 0,
                        latestAttemptNumber: 0,
                        latestAnswers: {},
                        latestEvaluations: {},
                    };
                }

                nextSummary[quizId].count += 1;

                if (attemptNumber >= nextSummary[quizId].latestAttemptNumber) {
                    nextSummary[quizId].latestAttemptNumber = attemptNumber;
                    nextSummary[quizId].latestAnswers = data.answers || {};
                    nextSummary[quizId].latestEvaluations = data.evaluations || {};
                }
            });

            setSummaryByQuiz(nextSummary);
        });

        return () => unsub();
    }, [studentId]);

    return summaryByQuiz;
};

// Provides submissions for quizzes owned by the current teacher.
export const useTeacherSubmissions = (teacherId) => {
    const [submissions, setSubmissions] = useState([]);

    useEffect(() => {
        if (!db || !teacherId) return;
        let unsubSubmissions = () => {};

        const quizzesQuery = query(
            collection(db, 'quizzes'),
            where('teacherId', '==', teacherId)
        );

        const unsubQuizzes = onSnapshot(quizzesQuery, (quizSnap) => {
            const quizIdSet = new Set(quizSnap.docs.map((quizDoc) => quizDoc.id));

            unsubSubmissions();
            unsubSubmissions = onSnapshot(collection(db, 'submissions'), (submissionSnap) => {
                const teacherSubmissions = submissionSnap.docs
                    .map((submissionDoc) => ({ id: submissionDoc.id, ...submissionDoc.data() }))
                    .filter((submission) => quizIdSet.has(submission.quizId))
                    .sort((a, b) => {
                        const aTime = new Date(a.attemptedAt || 0).getTime();
                        const bTime = new Date(b.attemptedAt || 0).getTime();
                        return bTime - aTime;
                    });

                setSubmissions(teacherSubmissions);
            });
        });

        return () => {
            unsubSubmissions();
            unsubQuizzes();
        };
    }, [teacherId]);

    return submissions;
};

// Exporting DB functions for use in other components
export { collection, doc, setDoc, addDoc, deleteDoc, onSnapshot, query, where, getDocs };
