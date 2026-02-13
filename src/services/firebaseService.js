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

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
export const PRIMARY_TEACHER_EMAIL = normalizeEmail(import.meta.env.VITE_TEACHER_EMAIL || "");

const parsedTeacherEmails = (() => {
  const rawTeacherList = import.meta.env.VITE_TEACHER_EMAILS || "";
  const splitEmails = rawTeacherList
    .split(',')
    .map((value) => normalizeEmail(value))
    .filter(Boolean);

  if (PRIMARY_TEACHER_EMAIL) {
    splitEmails.push(PRIMARY_TEACHER_EMAIL);
  }

  return Array.from(new Set(splitEmails));
})();

const configuredTeacherEmailSet = new Set(parsedTeacherEmails);
export const TEACHER_EMAIL = PRIMARY_TEACHER_EMAIL;

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

  const upsertUserProfile = async (currentUser) => {
    if (!db || !currentUser?.uid) return;
    const normalizedEmail = normalizeEmail(currentUser.email);

    try {
      await setDoc(
        doc(db, 'userProfiles', currentUser.uid),
        {
          uid: currentUser.uid,
          email: currentUser.email || '',
          normalizedEmail,
          displayName: currentUser.displayName || '',
          photoURL: currentUser.photoURL || '',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error('Failed to sync user profile:', error);
    }
  };

  useEffect(() => {
    if (!auth) {
        setLoading(false); 
        return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        void upsertUserProfile(currentUser);
      }
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

export const useTeacherRole = (user) => {
    const userId = user?.uid || '';
    const normalizedEmail = normalizeEmail(user?.email);
    const isPrimaryTeacher = normalizedEmail !== '' && normalizedEmail === PRIMARY_TEACHER_EMAIL;
    const isConfiguredTeacher = configuredTeacherEmailSet.has(normalizedEmail);
    const [allowlistStatus, setAllowlistStatus] = useState({ email: '', isTeacher: false });

    useEffect(() => {
        if (!userId || !normalizedEmail || isConfiguredTeacher || !db) return;

        const teacherRef = doc(db, 'teacherEmails', normalizedEmail);
        const unsub = onSnapshot(
            teacherRef,
            (teacherDoc) => {
                setAllowlistStatus({ email: normalizedEmail, isTeacher: teacherDoc.exists() });
            },
            () => {
                setAllowlistStatus({ email: normalizedEmail, isTeacher: false });
            }
        );

        return () => unsub();
    }, [userId, normalizedEmail, isConfiguredTeacher]);

    const isAllowlistedTeacher = allowlistStatus.email === normalizedEmail && allowlistStatus.isTeacher;
    const isTeacher = isConfiguredTeacher || isAllowlistedTeacher;
    const loading = !!userId && !!normalizedEmail && !isConfiguredTeacher && allowlistStatus.email !== normalizedEmail;

    return { isTeacher, isPrimaryTeacher, loading };
};

const sortClasses = (classes) =>
    [...classes].sort((a, b) => {
        const archivedDelta = Number(!!a.isArchived) - Number(!!b.isArchived);
        if (archivedDelta !== 0) return archivedDelta;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });

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

export const useTeacherClasses = (teacherId) => {
    const [classes, setClasses] = useState([]);

    useEffect(() => {
        if (!db || !teacherId) return;

        const teacherClassesQuery = query(
            collection(db, 'classes'),
            where('teacherId', '==', teacherId)
        );

        const unsub = onSnapshot(
            teacherClassesQuery,
            (snap) => {
                const rows = snap.docs.map((classDoc) => ({ id: classDoc.id, ...classDoc.data() }));
                setClasses(sortClasses(rows));
            },
            (error) => {
                console.error('Failed to load teacher classes:', error);
                setClasses([]);
            }
        );

        return () => unsub();
    }, [teacherId]);

    return classes;
};

export const useClassEnrollments = (classId) => {
    const [enrollments, setEnrollments] = useState([]);

    useEffect(() => {
        if (!db || !classId) {
            setEnrollments([]);
            return;
        }

        const enrollmentQuery = query(
            collection(db, 'classEnrollments'),
            where('classId', '==', classId)
        );

        const unsub = onSnapshot(
            enrollmentQuery,
            (snap) => {
                const rows = snap.docs
                    .map((rowDoc) => ({ id: rowDoc.id, ...rowDoc.data() }))
                    .sort((a, b) => String(a.studentEmail || '').localeCompare(String(b.studentEmail || '')));
                setEnrollments(rows);
            },
            (error) => {
                console.error('Failed to load class enrollments:', error);
                setEnrollments([]);
            }
        );

        return () => unsub();
    }, [classId]);

    return enrollments;
};

export const useStudentClasses = (studentId) => {
    const [classes, setClasses] = useState([]);

    useEffect(() => {
        if (!db || !studentId) {
            setClasses([]);
            return;
        }

        let classListeners = [];
        const classRowsById = new Map();

        const emit = () => {
            setClasses(sortClasses(Array.from(classRowsById.values())));
        };

        const clearClassListeners = () => {
            classListeners.forEach((unsubscribe) => unsubscribe());
            classListeners = [];
            classRowsById.clear();
        };

        const subscribeToClasses = (classIds) => {
            clearClassListeners();
            if (classIds.length === 0) {
                setClasses([]);
                return;
            }

            classIds.forEach((classId) => {
                const classRef = doc(db, 'classes', classId);
                const unsubscribe = onSnapshot(
                    classRef,
                    (classDoc) => {
                        if (classDoc.exists()) {
                            classRowsById.set(classId, { id: classDoc.id, ...classDoc.data() });
                        } else {
                            classRowsById.delete(classId);
                        }
                        emit();
                    },
                    (error) => {
                        console.error(`Failed to load class ${classId}:`, error);
                        classRowsById.delete(classId);
                        emit();
                    }
                );

                classListeners.push(unsubscribe);
            });
        };

        const enrollmentQuery = query(
            collection(db, 'classEnrollments'),
            where('studentId', '==', studentId)
        );

        const unsubscribeEnrollments = onSnapshot(
            enrollmentQuery,
            (enrollmentSnap) => {
                const classIds = Array.from(
                    new Set(
                        enrollmentSnap.docs
                            .map((enrollmentDoc) => enrollmentDoc.data()?.classId)
                            .filter(Boolean)
                    )
                );
                subscribeToClasses(classIds);
            },
            (error) => {
                console.error('Failed to load student enrollments:', error);
                subscribeToClasses([]);
            }
        );

        return () => {
            clearClassListeners();
            unsubscribeEnrollments();
        };
    }, [studentId]);

    return classes;
};

export const useQuizzesByClassIds = (classIds) => {
    const [quizzes, setQuizzes] = useState([]);

    useEffect(() => {
        if (!db) {
            setQuizzes([]);
            return;
        }

        const uniqueClassIds = Array.from(new Set((classIds || []).filter(Boolean)));
        if (uniqueClassIds.length === 0) {
            setQuizzes([]);
            return;
        }

        const quizzesByClass = new Map();
        const listeners = [];

        const emit = () => {
            const merged = Array.from(quizzesByClass.values())
                .flat()
                .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
            setQuizzes(merged);
        };

        uniqueClassIds.forEach((classId) => {
            const perClassQuizQuery = query(
                collection(db, 'quizzes'),
                where('classId', '==', classId)
            );

            const unsubscribe = onSnapshot(
                perClassQuizQuery,
                (snap) => {
                    quizzesByClass.set(classId, snap.docs.map((quizDoc) => ({ id: quizDoc.id, ...quizDoc.data() })));
                    emit();
                },
                (error) => {
                    console.error(`Failed to load quizzes for class ${classId}:`, error);
                    quizzesByClass.set(classId, []);
                    emit();
                }
            );

            listeners.push(unsubscribe);
        });

        return () => {
            listeners.forEach((unsubscribe) => unsubscribe());
        };
    }, [JSON.stringify((classIds || []).filter(Boolean).sort())]);

    return quizzes;
};

// Fetches only quizzes owned by the signed-in teacher.
export const useTeacherQuizzes = (teacherId) => {
    const [quizzes, setQuizzes] = useState([]);

    useEffect(() => {
        if (!db || !teacherId) return;

        const ownedQuizQuery = query(
            collection(db, 'quizzes'),
            where('teacherId', '==', teacherId)
        );

        const unsub = onSnapshot(ownedQuizQuery, (snap) => {
            setQuizzes(snap.docs.map((quizDoc) => ({ id: quizDoc.id, ...quizDoc.data() })));
        });

        return () => unsub();
    }, [teacherId]);

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

export const useStudentAttempts = (studentId) => {
    const [attempts, setAttempts] = useState([]);

    useEffect(() => {
        if (!db || !studentId) return;

        const submissionsQuery = query(
            collection(db, 'submissions'),
            where('studentId', '==', studentId)
        );

        const unsub = onSnapshot(submissionsQuery, (snap) => {
            const allAttempts = snap.docs
                .map((attemptDoc) => ({ id: attemptDoc.id, ...attemptDoc.data() }))
                .sort((a, b) => {
                    const attemptDelta = Number(b.attemptNumber || 0) - Number(a.attemptNumber || 0);
                    if (attemptDelta !== 0) return attemptDelta;
                    const aTime = new Date(a.attemptedAt || 0).getTime();
                    const bTime = new Date(b.attemptedAt || 0).getTime();
                    return bTime - aTime;
                });

            setAttempts(allAttempts);
        });

        return () => unsub();
    }, [studentId]);

    return attempts;
};

// Provides submissions for quizzes owned by the current teacher.
export const useTeacherSubmissions = (teacherId) => {
    const [submissions, setSubmissions] = useState([]);

    useEffect(() => {
        if (!db || !teacherId) return;
        let submissionUnsubs = [];
        const submissionsByQuiz = new Map();

        const emitMergedSubmissions = () => {
            const merged = Array.from(submissionsByQuiz.values())
                .flat()
                .sort((a, b) => {
                    const aTime = new Date(a.attemptedAt || 0).getTime();
                    const bTime = new Date(b.attemptedAt || 0).getTime();
                    return bTime - aTime;
                });

            setSubmissions(merged);
        };

        const quizzesQuery = query(
            collection(db, 'quizzes'),
            where('teacherId', '==', teacherId)
        );

        const unsubQuizzes = onSnapshot(quizzesQuery, (quizSnap) => {
            submissionUnsubs.forEach((unsub) => unsub());
            submissionUnsubs = [];
            submissionsByQuiz.clear();

            const quizIds = quizSnap.docs.map((quizDoc) => quizDoc.id);
            if (quizIds.length === 0) {
                setSubmissions([]);
                return;
            }

            quizIds.forEach((quizId) => {
                const perQuizSubmissionsQuery = query(
                    collection(db, 'submissions'),
                    where('quizId', '==', quizId)
                );

                const unsub = onSnapshot(
                    perQuizSubmissionsQuery,
                    (submissionSnap) => {
                        const rows = submissionSnap.docs.map((submissionDoc) => ({
                            id: submissionDoc.id,
                            ...submissionDoc.data(),
                        }));
                        submissionsByQuiz.set(quizId, rows);
                        emitMergedSubmissions();
                    },
                    (error) => {
                        console.error(`Error loading submissions for quiz ${quizId}:`, error);
                        submissionsByQuiz.set(quizId, []);
                        emitMergedSubmissions();
                    }
                );

                submissionUnsubs.push(unsub);
            });
        });

        return () => {
            submissionUnsubs.forEach((unsub) => unsub());
            unsubQuizzes();
        };
    }, [teacherId]);

    return submissions;
};

export const useTeacherEmails = (enabled = true) => {
    const [teacherEmails, setTeacherEmails] = useState([]);

    useEffect(() => {
        if (!db || !enabled) return;

        const unsub = onSnapshot(
            collection(db, 'teacherEmails'),
            (snap) => {
                const emails = snap.docs
                    .map((teacherDoc) => normalizeEmail(teacherDoc.id))
                    .filter(Boolean)
                    .sort();
                setTeacherEmails(emails);
            },
            (error) => {
                console.error('Failed to read teacherEmails collection:', error);
                setTeacherEmails([]);
            }
        );

        return () => unsub();
    }, [enabled]);

    return teacherEmails;
};

// Exporting DB functions for use in other components
export { collection, doc, setDoc, addDoc, deleteDoc, onSnapshot, query, where, getDocs };
