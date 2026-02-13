import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Edit3, Plus, Trash2, Save, Users, Loader2, LogOut, LayoutList, Lock, Shuffle, Eye, UserPlus } from 'lucide-react';
import {
  doc, setDoc, deleteDoc, db, useTeacherQuizzes, useTeacherSubmissions, useTeacherEmails,
  useTeacherClasses, useClassEnrollments, collection, getDocs, query, where,
} from '../../services/firebaseService';
import { MathEditor } from '../Editor/MathEditor';
import { MathRenderer } from '../Editor/MathRenderer';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const buildQuizPayload = (quiz, user) => {
  const parsedAttempts = Number(quiz.maxAttempts ?? 1);
  const maxAttempts = Number.isFinite(parsedAttempts) && parsedAttempts > 0 ? Math.floor(parsedAttempts) : 1;
  return {
    title: quiz.title || 'Untitled Quiz',
    description: quiz.description || '',
    isLocked: !!quiz.isLocked,
    maxAttempts,
    prefillFromLastAttempt: !!quiz.prefillFromLastAttempt,
    questions: Array.isArray(quiz.questions)
      ? quiz.questions.map((q, idx) => ({ id: q?.id || `q-${Date.now()}-${idx}`, text: q?.text || '', showFeedback: !!q?.showFeedback }))
      : [],
    allowShuffle: quiz.allowShuffle !== false,
    allowReview: quiz.allowReview !== false,
    classId: quiz.classId || '',
    className: quiz.className || '',
    teacherId: user.uid,
    teacherName: user.displayName || user.email || '',
    updatedAt: new Date().toISOString(),
  };
};

export const TeacherDashboard = ({ user, handleLogout, isPrimaryTeacher = false, onSwitchToStudentView }) => {
  const quizzes = useTeacherQuizzes(user.uid);
  const submissions = useTeacherSubmissions(user.uid);
  const teacherEmails = useTeacherEmails(isPrimaryTeacher);
  const classes = useTeacherClasses(user.uid);

  const [view, setView] = useState('list');
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [activeSubmission, setActiveSubmission] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState('all');
  const [isSaving, setIsSaving] = useState(false);
  const [isMigratingLegacy, setIsMigratingLegacy] = useState(false);
  const [legacyHandled, setLegacyHandled] = useState(false);

  const [newClassName, setNewClassName] = useState('');
  const [isUpdatingClasses, setIsUpdatingClasses] = useState(false);
  const [rosterEmailInput, setRosterEmailInput] = useState('');
  const [isUpdatingRoster, setIsUpdatingRoster] = useState(false);

  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [isUpdatingTeachers, setIsUpdatingTeachers] = useState(false);

  const classLookup = useMemo(() => Object.fromEntries(classes.map((row) => [row.id, row])), [classes]);
  const selectedClass = selectedClassId === 'all' ? null : classLookup[selectedClassId] || null;
  const classEnrollments = useClassEnrollments(selectedClass?.id || null);

  const filteredQuizzes = useMemo(() => {
    const scoped = selectedClassId === 'all' ? quizzes : quizzes.filter((q) => q.classId === selectedClassId);
    return [...scoped].sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  }, [quizzes, selectedClassId]);

  const quizLookup = useMemo(() => Object.fromEntries(quizzes.map((q) => [q.id, q])), [quizzes]);
  const filteredSubmissions = useMemo(() => {
    const scoped = selectedClassId === 'all'
      ? submissions
      : submissions.filter((row) => quizLookup[row.quizId]?.classId === selectedClassId);
    return [...scoped].sort((a, b) => new Date(b.attemptedAt || 0).getTime() - new Date(a.attemptedAt || 0).getTime());
  }, [submissions, quizLookup, selectedClassId]);

  useEffect(() => {
    if (selectedClassId === 'all') return;
    if (classLookup[selectedClassId]) return;
    const fallback = classes.find((row) => !row.isArchived) || classes[0];
    setSelectedClassId(fallback ? fallback.id : 'all');
  }, [selectedClassId, classLookup, classes]);

  const getOrCreateDefaultClass = async () => {
    const existing = await getDocs(query(collection(db, 'classes'), where('teacherId', '==', user.uid), where('isDefault', '==', true)));
    if (!existing.empty) {
      const row = existing.docs[0];
      return { id: row.id, ...row.data() };
    }
    const classRef = doc(collection(db, 'classes'));
    const now = new Date().toISOString();
    const payload = {
      name: 'Unassigned', teacherId: user.uid, teacherName: user.displayName || user.email || '',
      isArchived: false, isDefault: true, createdAt: now, updatedAt: now,
    };
    await setDoc(classRef, payload);
    return { id: classRef.id, ...payload };
  };

  useEffect(() => {
    if (!db || legacyHandled) return;
    const legacy = quizzes.filter((q) => !q.classId);
    if (legacy.length === 0) {
      setLegacyHandled(true);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setIsMigratingLegacy(true);
      try {
        const defaultClass = await getOrCreateDefaultClass();
        await Promise.all(legacy.map((quiz) =>
          setDoc(doc(db, 'quizzes', quiz.id), { classId: defaultClass.id, className: defaultClass.name, updatedAt: new Date().toISOString() }, { merge: true })));
      } catch (error) {
        console.error('Legacy migration failed:', error);
      } finally {
        if (!cancelled) {
          setIsMigratingLegacy(false);
          setLegacyHandled(true);
        }
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [legacyHandled, quizzes, user.uid, user.displayName, user.email]);

  const startNewQuiz = () => {
    if (!selectedClass || selectedClassId === 'all') {
      alert('Select a class first.');
      return;
    }
    if (selectedClass.isArchived) {
      alert('Cannot add quiz to archived class.');
      return;
    }
    setActiveQuiz({
      title: 'New Quiz Title', description: '', isLocked: false, maxAttempts: 1, prefillFromLastAttempt: false,
      questions: [{ id: `q-${Date.now()}`, text: '', showFeedback: true }],
      allowShuffle: true, allowReview: true, classId: selectedClass.id, className: selectedClass.name,
      teacherId: user.uid, teacherName: user.displayName || user.email || '',
    });
    setView('new');
  };

  const startEditQuiz = (quiz) => {
    setActiveQuiz({ ...quiz, className: quiz.className || classLookup[quiz.classId]?.name || '' });
    setView('edit');
  };

  const saveQuiz = async () => {
    if (!activeQuiz || !db) return;
    if (!activeQuiz.classId || !classLookup[activeQuiz.classId]) {
      alert('Choose one of your classes for this quiz.');
      return;
    }
    setIsSaving(true);
    try {
      const payload = buildQuizPayload({ ...activeQuiz, className: classLookup[activeQuiz.classId]?.name || '' }, user);
      if (view === 'new') {
        const newRef = doc(collection(db, 'quizzes'));
        await setDoc(newRef, { ...payload, createdAt: new Date().toISOString() });
      } else {
        await setDoc(doc(db, 'quizzes', activeQuiz.id), payload, { merge: true });
      }
      setView('list');
      setActiveQuiz(null);
    } catch (error) {
      console.error('Error saving quiz:', error);
      alert(`Failed to save quiz: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteQuiz = async (quizId) => {
    if (!window.confirm('Delete this quiz?')) return;
    try { await deleteDoc(doc(db, 'quizzes', quizId)); } catch (error) { alert('Failed to delete quiz.'); console.error(error); }
  };

  const createClass = async () => {
    const trimmed = String(newClassName || '').trim();
    if (!trimmed) return;
    setIsUpdatingClasses(true);
    try {
      const classRef = doc(collection(db, 'classes'));
      const now = new Date().toISOString();
      await setDoc(classRef, {
        name: trimmed, teacherId: user.uid, teacherName: user.displayName || user.email || '',
        isArchived: false, isDefault: false, createdAt: now, updatedAt: now,
      });
      setNewClassName('');
      setSelectedClassId(classRef.id);
    } catch (error) {
      alert('Failed to create class.');
      console.error(error);
    } finally {
      setIsUpdatingClasses(false);
    }
  };

  const renameClass = async (classroom) => {
    const nextName = window.prompt('Rename class', classroom.name || '');
    if (nextName == null) return;
    const trimmed = nextName.trim();
    if (!trimmed) return;
    setIsUpdatingClasses(true);
    try { await setDoc(doc(db, 'classes', classroom.id), { name: trimmed, updatedAt: new Date().toISOString() }, { merge: true }); }
    catch (error) { alert('Failed to rename class.'); console.error(error); }
    finally { setIsUpdatingClasses(false); }
  };

  const toggleArchiveClass = async (classroom) => {
    setIsUpdatingClasses(true);
    try { await setDoc(doc(db, 'classes', classroom.id), { isArchived: !classroom.isArchived, updatedAt: new Date().toISOString() }, { merge: true }); }
    catch (error) { alert('Failed to update class.'); console.error(error); }
    finally { setIsUpdatingClasses(false); }
  };

  const deleteClassroom = async (classroom) => {
    if (classroom.isDefault) { alert('Cannot delete default class.'); return; }
    if (quizzes.some((q) => q.classId === classroom.id)) { alert('Move/delete quizzes in this class first.'); return; }
    if (!window.confirm(`Delete class "${classroom.name}" and all enrollments?`)) return;
    setIsUpdatingClasses(true);
    try {
      const enrollments = await getDocs(query(collection(db, 'classEnrollments'), where('classId', '==', classroom.id)));
      await Promise.all(enrollments.docs.map((row) => deleteDoc(doc(db, 'classEnrollments', row.id))));
      await deleteDoc(doc(db, 'classes', classroom.id));
      if (selectedClassId === classroom.id) setSelectedClassId('all');
    } catch (error) {
      alert('Failed to delete class.');
      console.error(error);
    } finally {
      setIsUpdatingClasses(false);
    }
  };

  const addStudentEnrollment = async () => {
    if (!selectedClass) { alert('Select a class.'); return; }
    const email = normalizeEmail(rosterEmailInput);
    if (!email || !email.includes('@')) { alert('Enter a valid student email.'); return; }
    setIsUpdatingRoster(true);
    try {
      const profileSnap = await getDocs(query(collection(db, 'userProfiles'), where('normalizedEmail', '==', email)));
      if (profileSnap.empty) { alert('Student must sign in once before enrollment.'); return; }
      const profileDoc = profileSnap.docs[0];
      await setDoc(doc(db, 'classEnrollments', `${selectedClass.id}_${profileDoc.id}`), {
        classId: selectedClass.id, studentId: profileDoc.id, studentEmail: email,
        studentName: profileDoc.data()?.displayName || profileDoc.data()?.email || email,
        addedByTeacherId: user.uid, createdAt: new Date().toISOString(),
      });
      setRosterEmailInput('');
    } catch (error) {
      alert('Failed to add student.');
      console.error(error);
    } finally {
      setIsUpdatingRoster(false);
    }
  };

  const removeEnrollment = async (row) => {
    if (!window.confirm(`Remove ${row.studentEmail || row.studentId} from class?`)) return;
    setIsUpdatingRoster(true);
    try { await deleteDoc(doc(db, 'classEnrollments', row.id)); }
    catch (error) { alert('Failed to remove student.'); console.error(error); }
    finally { setIsUpdatingRoster(false); }
  };

  const addTeacherEmail = async () => {
    const email = normalizeEmail(newTeacherEmail);
    if (!email || !email.includes('@')) return;
    setIsUpdatingTeachers(true);
    try { await setDoc(doc(db, 'teacherEmails', email), { email, addedAt: new Date().toISOString(), addedBy: user.uid }); setNewTeacherEmail(''); }
    catch (error) { alert('Failed to add teacher email.'); console.error(error); }
    finally { setIsUpdatingTeachers(false); }
  };

  const removeTeacherEmail = async (email) => {
    if (!window.confirm(`Remove teacher access for ${email}?`)) return;
    setIsUpdatingTeachers(true);
    try { await deleteDoc(doc(db, 'teacherEmails', normalizeEmail(email))); }
    catch (error) { alert('Failed to remove teacher email.'); console.error(error); }
    finally { setIsUpdatingTeachers(false); }
  };

  const deleteSubmissionAttempt = async (submission) => {
    if (!window.confirm(`Delete Attempt ${submission.attemptNumber || 1}?`)) return;
    try {
      await deleteDoc(doc(db, 'submissions', submission.id));
      if (activeSubmission?.id === submission.id) { setActiveSubmission(null); setView('list'); }
    } catch (error) {
      alert('Failed to delete attempt.');
      console.error(error);
    }
  };

  const renderSubmissionReview = () => {
    if (!activeSubmission) return null;
    const sourceQuiz = quizzes.find((quiz) => quiz.id === activeSubmission.quizId);
    const questions = Array.isArray(sourceQuiz?.questions) ? sourceQuiz.questions : [];
    const questionList = questions.length ? questions : Object.keys(activeSubmission.answers || {}).map((id) => ({ id, text: `Question ID: ${id}` }));
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-extrabold text-slate-800">Submission Review</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => deleteSubmissionAttempt(activeSubmission)} className="flex items-center gap-2 py-2 px-4 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition font-semibold"><Trash2 className="w-5 h-5" /> Delete Attempt</button>
            <button onClick={() => setView('list')} className="flex items-center gap-2 py-2 px-4 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition font-semibold"><Users className="w-5 h-5" /> Back</button>
          </div>
        </div>
        <div className="space-y-4">
          {questionList.map((question, index) => {
            const answerText = activeSubmission.answers?.[question.id] || '';
            const evaluation = activeSubmission.evaluations?.[question.id];
            return (
              <div key={question.id || `q-${index}`} className="bg-white rounded-xl shadow-lg border border-slate-100 p-6 space-y-4">
                <div><div className="text-sm font-semibold text-slate-500 mb-2">Question {index + 1}</div><div className="p-4 border border-slate-200 rounded-lg bg-slate-50"><MathRenderer text={question.text || ''} /></div></div>
                <div><div className="text-sm font-semibold text-slate-500 mb-2">Student Answer</div><div className="p-4 border border-slate-200 rounded-lg bg-white">{answerText.trim() ? <MathRenderer text={answerText} /> : <span className="text-slate-500 text-sm">No answer provided.</span>}</div></div>
                {evaluation ? <div className={`p-4 rounded-lg border text-sm ${evaluation.isCorrect ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}><div className="font-semibold">{evaluation.isCorrect ? 'Marked Correct' : 'Marked Needs Review'}</div><div className="mt-1">{evaluation.feedback || 'No feedback available.'}</div></div> : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderQuizEditor = () => (
    <div className="space-y-6">
      <h2 className="text-3xl font-extrabold text-slate-800 flex items-center justify-between">
        {view === 'new' ? 'Create New Quiz' : 'Edit Quiz'}
        <div className="flex gap-3">
          <button onClick={() => setView('list')} className="flex items-center gap-2 py-2 px-4 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition font-semibold"><Users className="w-5 h-5" /> View Quizzes</button>
          <button onClick={saveQuiz} disabled={isSaving} className="flex items-center gap-2 py-2 px-6 bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-200 hover:bg-green-700 transition disabled:opacity-70">{isSaving ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}{isSaving ? 'Saving...' : 'Save Quiz'}</button>
        </div>
      </h2>
      <MathEditor quiz={activeQuiz} setQuiz={setActiveQuiz} isTeacher={true} classes={classes} />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4"><BookOpen className="w-7 h-7 text-indigo-600" /><h1 className="text-2xl font-extrabold text-slate-800">Teacher Dashboard</h1></div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-slate-600 hidden sm:block">{user.displayName || user.email}</span>
            {onSwitchToStudentView ? <button onClick={onSwitchToStudentView} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition"><Users className="w-4 h-4" /> Student Mode</button> : null}
            <button onClick={handleLogout} className="bg-red-50 text-red-700 p-2 rounded-lg hover:bg-red-100 transition"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === 'list' ? (
          <div className="space-y-6">
            <h2 className="text-3xl font-extrabold text-slate-800">Quizzes {selectedClass ? `for ${selectedClass.name}` : '(All Classes)'} ({filteredQuizzes.length})</h2>
            {isMigratingLegacy ? <div className="p-3 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-800 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Migrating legacy quizzes to default class...</div> : null}

            <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div><h3 className="text-xl font-bold text-slate-800">Classes</h3><p className="text-sm text-slate-600">Create classes, filter dashboard, and author quizzes inside a class.</p></div>
                <div className="flex gap-2">
                  <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm">
                    <option value="all">All Classes</option>
                    {classes.map((row) => <option key={row.id} value={row.id}>{row.name} {row.isArchived ? '(Archived)' : ''}</option>)}
                  </select>
                  <button onClick={startNewQuiz} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition shadow-sm flex items-center gap-2"><Plus className="w-4 h-4" /> New Quiz</button>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input type="text" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="New class name" className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
                <button onClick={createClass} disabled={isUpdatingClasses} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-70">{isUpdatingClasses ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Create Class</button>
              </div>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {classes.length === 0 ? <div className="p-3 text-sm text-slate-500">No classes yet.</div> : classes.map((row) => (
                  <div key={row.id} className="p-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                    <button onClick={() => setSelectedClassId(row.id)} className={`text-left px-3 py-2 rounded-lg border text-sm font-semibold ${selectedClassId === row.id ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}>{row.name} {row.isArchived ? '(Archived)' : ''}</button>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => renameClass(row)} disabled={isUpdatingClasses} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-100 disabled:opacity-70 text-sm"><Edit3 className="w-4 h-4" /> Rename</button>
                      <button onClick={() => toggleArchiveClass(row)} disabled={isUpdatingClasses} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg font-semibold hover:bg-amber-100 disabled:opacity-70 text-sm"><Lock className="w-4 h-4" /> {row.isArchived ? 'Unarchive' : 'Archive'}</button>
                      <button onClick={() => deleteClassroom(row)} disabled={isUpdatingClasses} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg font-semibold hover:bg-red-100 disabled:opacity-70 text-sm"><Trash2 className="w-4 h-4" /> Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-5 space-y-4">
              <div><h3 className="text-xl font-bold text-slate-800">Class Roster</h3><p className="text-sm text-slate-600">{selectedClass ? `Manage ${selectedClass.name}` : 'Select a class to manage roster'}</p></div>
              {!selectedClass ? <div className="p-3 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg">Choose a class first.</div> : (
                <>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input type="email" value={rosterEmailInput} onChange={(e) => setRosterEmailInput(e.target.value)} placeholder="student@example.com" className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
                    <button onClick={addStudentEnrollment} disabled={isUpdatingRoster} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-70">{isUpdatingRoster ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}Add Student</button>
                  </div>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {classEnrollments.length === 0 ? <div className="p-3 text-sm text-slate-500">No students enrolled.</div> : classEnrollments.map((row) => (
                      <div key={row.id} className="p-3 flex items-center justify-between gap-2">
                        <div><div className="text-sm font-semibold text-slate-700">{row.studentName || row.studentEmail || row.studentId}</div><div className="text-xs text-slate-500">{row.studentEmail || row.studentId}</div></div>
                        <button onClick={() => removeEnrollment(row)} disabled={isUpdatingRoster} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg font-semibold hover:bg-red-100 disabled:opacity-70 text-sm"><Trash2 className="w-4 h-4" /> Remove</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {isPrimaryTeacher ? (
              <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-5 space-y-4">
                <div><h3 className="text-xl font-bold text-slate-800">Teacher Access</h3><p className="text-sm text-slate-600">Allowlist additional teachers.</p></div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input type="email" value={newTeacherEmail} onChange={(e) => setNewTeacherEmail(e.target.value)} placeholder="teacher@example.com" className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" />
                  <button onClick={addTeacherEmail} disabled={isUpdatingTeachers} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-70">{isUpdatingTeachers ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}Add Teacher</button>
                </div>
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                  {teacherEmails.length === 0 ? <div className="p-3 text-sm text-slate-500">No extra teacher emails configured.</div> : teacherEmails.map((email) => (
                    <div key={email} className="p-3 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-700">{email}</span>
                      <button onClick={() => removeTeacherEmail(email)} disabled={isUpdatingTeachers} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg font-semibold hover:bg-red-100 disabled:opacity-70 text-sm"><Trash2 className="w-4 h-4" /> Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredQuizzes.length === 0 ? (
                <div className="col-span-3 text-center p-12 bg-white rounded-xl shadow-lg border border-slate-200 text-slate-500"><LayoutList className="w-8 h-8 mx-auto mb-3" /><p className="font-bold">No Quizzes Found</p><p>Create one to get started.</p></div>
              ) : filteredQuizzes.map((quiz) => (
                <div key={quiz.id} className="bg-white p-6 rounded-xl shadow-lg border border-slate-100 hover:shadow-xl transition flex flex-col justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2 truncate">{quiz.title}</h3>
                    <div className="text-sm text-slate-600 space-y-1">
                      <div className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-indigo-500" /><span>{quiz.questions?.length || 0} Questions</span></div>
                      <div className="flex items-center gap-2">{quiz.isLocked ? <Lock className="w-4 h-4 text-red-500" /> : <BookOpen className="w-4 h-4 text-green-500" />}<span>{quiz.isLocked ? 'Locked' : 'Active'}</span></div>
                      <div className="flex items-center gap-2"><Shuffle className="w-4 h-4 text-amber-500" /><span>Max Attempts: {quiz.maxAttempts ?? 1}</span></div>
                      <div className="text-xs text-slate-500">Class: {classLookup[quiz.classId]?.name || quiz.className || 'Unknown'}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2 pt-4 border-t border-slate-100">
                    <button onClick={() => startEditQuiz(quiz)} className="flex-1 flex items-center justify-center p-3 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg font-semibold hover:bg-indigo-100 transition text-sm"><Edit3 className="w-4 h-4 mr-2" /> Edit</button>
                    <button onClick={() => deleteQuiz(quiz.id)} className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition text-sm"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 bg-white rounded-xl shadow-lg border border-slate-100">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between"><h3 className="text-xl font-bold text-slate-800">Recent Student Submissions</h3><span className="text-sm text-slate-500">{filteredSubmissions.length} total</span></div>
              {filteredSubmissions.length === 0 ? <div className="p-6 text-sm text-slate-500">No submissions yet.</div> : (
                <div className="divide-y divide-slate-100">
                  {filteredSubmissions.slice(0, 10).map((submission) => (
                    <div key={submission.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div><div className="font-semibold text-slate-800">{submission.quizTitle || 'Untitled Quiz'}</div><div className="text-sm text-slate-600">{submission.studentName || submission.studentEmail || 'Unknown Student'} - Attempt {submission.attemptNumber || 1}</div></div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-slate-600">{submission.gradeStatus === 'needs_teacher_review' ? 'Needs teacher review' : 'AI graded'} - {submission.attemptedAt ? new Date(submission.attemptedAt).toLocaleString() : 'Unknown time'}</div>
                        <button onClick={() => { setActiveSubmission(submission); setView('submission'); }} className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg font-semibold hover:bg-indigo-100 transition text-sm"><Eye className="w-4 h-4" /> Review</button>
                        <button onClick={() => deleteSubmissionAttempt(submission)} className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg font-semibold hover:bg-red-100 transition text-sm"><Trash2 className="w-4 h-4" /> Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
        {(view === 'edit' || view === 'new') && activeQuiz && renderQuizEditor()}
        {view === 'submission' && activeSubmission && renderSubmissionReview()}
      </main>
    </div>
  );
};
