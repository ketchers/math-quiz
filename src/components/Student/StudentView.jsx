import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, LogOut, CheckCircle, XCircle, Loader2, Shuffle, AlertTriangle, LayoutList, Eye, Users } from 'lucide-react';
import {
  addDoc, collection, db, useStudentSubmissions, useStudentAttempts,
  useStudentClasses, useTeacherClasses, useQuizzesByClassIds,
} from '../../services/firebaseService';
import { gradeSubmission } from '../../services/aiService';
import { MathRenderer } from '../Editor/MathRenderer';
import { EditorToolbar } from '../Editor/EditorToolbar';

const AnswerEditor = ({ value, onChange, disabled, placeholder }) => {
  const textareaRef = useRef(null);

  const handleInsert = (startTag, endTag) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const selection = text.substring(start, end);
    const after = text.substring(end);
    const inserted = before + startTag + (selection || 'text') + endTag + after;
    onChange(inserted);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + startTag.length, end + startTag.length + (selection ? 0 : 4));
    }, 0);
  };

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
      <EditorToolbar onInsert={handleInsert} />
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        placeholder={placeholder}
        className="w-full p-4 resize-y outline-none font-mono text-sm disabled:bg-slate-50"
        disabled={disabled}
      />
    </div>
  );
};

const StudentView = ({ user, handleLogout, isTeacherPreview = false, onReturnToTeacher }) => {
  const submissionSummary = useStudentSubmissions(user.uid);
  const submissionHistory = useStudentAttempts(user.uid);
  const enrolledClasses = useStudentClasses(user.uid);
  const teacherOwnedClasses = useTeacherClasses(isTeacherPreview ? user.uid : '');

  const mergedClasses = useMemo(() => {
    const byId = new Map();
    enrolledClasses.forEach((row) => byId.set(row.id, row));
    if (isTeacherPreview) teacherOwnedClasses.forEach((row) => byId.set(row.id, row));
    return Array.from(byId.values())
      .filter((row) => !row.isArchived)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [enrolledClasses, teacherOwnedClasses, isTeacherPreview]);

  const classIds = useMemo(() => mergedClasses.map((row) => row.id), [mergedClasses]);
  const allClassQuizzes = useQuizzesByClassIds(classIds);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [view, setView] = useState('list');
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [activeHistoryAttempt, setActiveHistoryAttempt] = useState(null);
  const [studentAnswers, setStudentAnswers] = useState({});
  const [gradingResult, setGradingResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingResult, setViewingResult] = useState(false);
  const [shuffledQuestions, setShuffledQuestions] = useState([]);

  useEffect(() => {
    if (mergedClasses.length === 0) {
      setSelectedClassId('');
      if (view !== 'list') setView('list');
      return;
    }
    if (!selectedClassId || !mergedClasses.some((row) => row.id === selectedClassId)) {
      setSelectedClassId(mergedClasses[0].id);
    }
  }, [mergedClasses, selectedClassId, view]);

  const selectedClass = useMemo(
    () => mergedClasses.find((row) => row.id === selectedClassId) || null,
    [mergedClasses, selectedClassId]
  );

  const quizzes = useMemo(() => {
    const scoped = selectedClassId
      ? allClassQuizzes.filter((quiz) => quiz.classId === selectedClassId)
      : [];
    return scoped
      .filter((quiz) => !quiz.isLocked)
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  }, [allClassQuizzes, selectedClassId]);

  useEffect(() => {
    if (!activeQuiz) return;
    const stillVisible = allClassQuizzes.some((quiz) => quiz.id === activeQuiz.id);
    if (!stillVisible) {
      setActiveQuiz(null);
      setView('list');
    }
  }, [allClassQuizzes, activeQuiz]);

  const attemptsByQuiz = useMemo(() => {
    const grouped = {};
    submissionHistory.forEach((attempt) => {
      if (!attempt?.quizId) return;
      if (!grouped[attempt.quizId]) grouped[attempt.quizId] = [];
      grouped[attempt.quizId].push(attempt);
    });
    Object.values(grouped).forEach((attempts) => {
      attempts.sort((a, b) => {
        const attemptDelta = Number(b.attemptNumber || 0) - Number(a.attemptNumber || 0);
        if (attemptDelta !== 0) return attemptDelta;
        return new Date(b.attemptedAt || 0).getTime() - new Date(a.attemptedAt || 0).getTime();
      });
    });
    return grouped;
  }, [submissionHistory]);

  const getMaxAttempts = (quiz) => {
    const raw = Number(quiz?.maxAttempts ?? 1);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
  };

  const getAttemptInfo = (quiz) => {
    const maxAttempts = getMaxAttempts(quiz);
    const usedAttempts = submissionSummary?.[quiz.id]?.count || 0;
    const remainingAttempts = Math.max(0, maxAttempts - usedAttempts);
    return { maxAttempts, usedAttempts, remainingAttempts };
  };

  const buildFallbackEvaluations = (quiz) => {
    const fallback = {};
    (quiz?.questions || []).forEach((question) => {
      if (!question?.id) return;
      fallback[question.id] = {
        isCorrect: false,
        feedback: 'AI grading is unavailable. Your answer was saved and needs teacher review.',
      };
    });
    return fallback;
  };

  const startQuiz = (quiz) => {
    const { remainingAttempts } = getAttemptInfo(quiz);
    if (remainingAttempts <= 0) {
      alert('No attempts remaining for this quiz.');
      return;
    }
    setActiveQuiz(quiz);
    const latestAnswers = submissionSummary?.[quiz.id]?.latestAnswers || {};
    setStudentAnswers(quiz.prefillFromLastAttempt ? latestAnswers : {});
    setGradingResult(null);
    setViewingResult(false);
    setActiveHistoryAttempt(null);
    setShuffledQuestions(quiz.allowShuffle ? [...(quiz.questions || [])].sort(() => Math.random() - 0.5) : (quiz.questions || []));
    setView('quiz');
  };

  const startReviewHistory = (quiz) => {
    if (!quiz) return;
    if (quiz.allowReview === false) {
      alert('Your teacher has disabled attempt review for this quiz.');
      return;
    }
    const attempts = attemptsByQuiz[quiz.id] || [];
    setActiveQuiz(quiz);
    setActiveHistoryAttempt(attempts[0] || null);
    setView('history');
  };

  const submitQuiz = async () => {
    if (!activeQuiz || isSubmitting) return;
    const { maxAttempts, usedAttempts, remainingAttempts } = getAttemptInfo(activeQuiz);
    if (remainingAttempts <= 0) {
      alert('Attempt limit reached for this quiz.');
      return;
    }

    const answeredCount = Object.keys(studentAnswers).filter((key) => (studentAnswers[key] || '').trim() !== '').length;
    if (answeredCount < (activeQuiz.questions || []).length) {
      if (!window.confirm(`You have only answered ${answeredCount} of ${activeQuiz.questions.length} questions. Submit anyway?`)) return;
    }

    setIsSubmitting(true);
    setViewingResult(false);
    const gradingData = await gradeSubmission(activeQuiz, studentAnswers);
    const evaluations = gradingData?.evaluations || buildFallbackEvaluations(activeQuiz);
    const gradeStatus = gradingData?.evaluations ? 'graded' : 'needs_teacher_review';
    const attemptNumber = usedAttempts + 1;

    try {
      await addDoc(collection(db, 'submissions'), {
        quizId: activeQuiz.id,
        quizTitle: activeQuiz.title,
        classId: activeQuiz.classId || '',
        className: activeQuiz.className || selectedClass?.name || '',
        studentId: user.uid,
        studentEmail: user.email || '',
        studentName: user.displayName || user.email || '',
        answers: studentAnswers,
        evaluations,
        gradeStatus,
        attemptNumber,
        maxAttemptsAtSubmission: maxAttempts,
        attemptedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to save submission:', error);
      alert('Your answers could not be saved. Please retry.');
      setIsSubmitting(false);
      return;
    }

    setGradingResult(evaluations);
    setViewingResult(true);
    setView('results');
    setIsSubmitting(false);
  };

  const handleAnswerChange = (questionId, value) => {
    setStudentAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const renderQuizList = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-800">My Classes</h2>
          <p className="text-slate-600 text-sm">Select a class to view quizzes.</p>
        </div>
      </div>

      {mergedClasses.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-xl shadow-lg border border-slate-200 text-slate-500">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3" />
          <p className="font-bold">No Classes Yet</p>
          <p>{isTeacherPreview ? 'Create a class in Teacher Dashboard to test student mode.' : 'You are not enrolled in any classes yet.'}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {mergedClasses.map((row) => (
              <button
                key={row.id}
                onClick={() => setSelectedClassId(row.id)}
                className={`px-3 py-2 rounded-lg border text-sm font-semibold ${selectedClassId === row.id ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
              >
                {row.name}
              </button>
            ))}
          </div>

          <h3 className="text-2xl font-bold text-slate-800">
            {selectedClass?.name || 'Selected Class'} Quizzes ({quizzes.length})
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quizzes.length === 0 ? (
              <div className="col-span-3 text-center p-12 bg-white rounded-xl shadow-lg border border-slate-200 text-slate-500">
                <LayoutList className="w-8 h-8 mx-auto mb-3" />
                <p className="font-bold">No Quizzes Available</p>
                <p>This class has no visible quizzes yet.</p>
              </div>
            ) : (
              quizzes.map((quiz) => {
                const { maxAttempts, usedAttempts, remainingAttempts } = getAttemptInfo(quiz);
                const attemptsExhausted = remainingAttempts <= 0;
                return (
                  <div key={quiz.id} className="bg-white p-6 rounded-xl shadow-lg border border-slate-100 hover:shadow-xl transition flex flex-col justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 mb-2 truncate">{quiz.title}</h3>
                      <p className="text-sm text-slate-500 mb-4 line-clamp-2">{quiz.description}</p>
                      <div className="text-sm text-slate-600 space-y-1">
                        <div className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-indigo-500" /><span>{quiz.questions?.length || 0} Questions</span></div>
                        <div className="flex items-center gap-2">{quiz.allowShuffle ? <Shuffle className="w-4 h-4 text-orange-500" /> : <LayoutList className="w-4 h-4 text-slate-500" />}<span>{quiz.allowShuffle ? 'Questions are shuffled' : 'Fixed order'}</span></div>
                        <div className="flex items-center gap-2"><CheckCircle className={`w-4 h-4 ${attemptsExhausted ? 'text-red-500' : 'text-green-500'}`} /><span>Attempts: {usedAttempts}/{maxAttempts} ({remainingAttempts} remaining)</span></div>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2 pt-4 border-t border-slate-100">
                      <button onClick={() => startQuiz(quiz)} disabled={attemptsExhausted} className={`flex-1 flex items-center justify-center p-3 rounded-lg font-semibold transition text-sm ${attemptsExhausted ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-indigo-500 text-white hover:bg-indigo-600'}`}><BookOpen className="w-4 h-4 mr-2" /> {attemptsExhausted ? 'No Attempts Left' : 'Start Quiz'}</button>
                      {quiz.allowReview !== false && usedAttempts > 0 ? <button onClick={() => startReviewHistory(quiz)} className="flex-1 flex items-center justify-center p-3 rounded-lg font-semibold transition text-sm bg-slate-100 text-slate-700 hover:bg-slate-200"><Eye className="w-4 h-4 mr-2" /> View Attempts</button> : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );

  const renderQuizTaking = () => (
    <div className="space-y-6">
      <h2 className="text-3xl font-extrabold text-slate-800 border-b border-slate-200 pb-4 mb-4">{activeQuiz.title}</h2>
      <p className="text-slate-600 mb-6">{activeQuiz.description}</p>
      <div className="space-y-10">
        {shuffledQuestions.map((q, index) => {
          const ans = studentAnswers[q.id] || '';
          const result = gradingResult?.[q.id];
          return (
            <div key={q.id} className="p-6 bg-white rounded-xl shadow-lg border border-slate-100">
              <h3 className="text-xl font-bold text-slate-700 mb-4">Question {index + 1}</h3>
              <div className="mb-6 p-4 border border-slate-200 rounded-lg bg-slate-50"><MathRenderer text={q.text} /></div>
              <AnswerEditor value={ans} onChange={(value) => handleAnswerChange(q.id, value)} disabled={isSubmitting || viewingResult} placeholder="Type your answer here. Markdown, LaTeX, Sage blocks, and image links are supported." />
              {!viewingResult && ans.trim() !== '' ? <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg"><span className="text-xs font-bold text-indigo-700 block mb-1">Answer Preview</span><MathRenderer text={ans} /></div> : null}
              {viewingResult && result ? (
                <div className={`p-4 rounded-xl flex gap-3 items-start mt-4 ${result.isCorrect ? 'bg-green-50 text-green-800 border border-green-100' : 'bg-red-50 text-red-800 border border-red-100'}`}>
                  {result.isCorrect ? <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" /> : <XCircle className="w-5 h-5 mt-0.5 shrink-0" />}
                  <div className="text-sm"><div className="font-bold">{result.isCorrect ? 'Correct' : 'Needs Review'}</div><div className="opacity-90 mt-1">{result.feedback}</div></div>
                </div>
              ) : null}
            </div>
          );
        })}

        {!viewingResult ? (
          <button onClick={submitQuiz} disabled={isSubmitting} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition flex justify-center items-center gap-2 disabled:opacity-70">
            {isSubmitting ? <Loader2 className="animate-spin w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
            {isSubmitting ? 'Grading...' : 'Submit Quiz for AI Grade'}
          </button>
        ) : (
          <button onClick={() => setView('list')} className="w-full py-4 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition flex justify-center items-center gap-2">
            <BookOpen className="w-5 h-5" /> Back to Quizzes
          </button>
        )}
      </div>
    </div>
  );

  const renderAttemptHistory = () => {
    if (!activeQuiz) return null;
    const quizAttempts = attemptsByQuiz[activeQuiz.id] || [];
    const questions = Array.isArray(activeQuiz.questions) ? activeQuiz.questions : [];
    const questionLookup = Object.fromEntries(questions.map((question) => [question.id, question]));

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div><h2 className="text-3xl font-extrabold text-slate-800">Past Attempts</h2><p className="text-slate-600">{activeQuiz.title}</p></div>
          <button onClick={() => setView('list')} className="inline-flex items-center justify-center gap-2 py-2 px-4 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition"><BookOpen className="w-5 h-5" /> Back</button>
        </div>

        {quizAttempts.length === 0 ? (
          <div className="p-6 bg-white rounded-xl shadow-lg border border-slate-200 text-slate-500">No past attempts are available for this quiz yet.</div>
        ) : (
          <div className="bg-white rounded-xl shadow-lg border border-slate-100 divide-y divide-slate-100">
            {quizAttempts.map((attempt) => {
              const isSelected = activeHistoryAttempt?.id === attempt.id;
              return (
                <button key={attempt.id} onClick={() => setActiveHistoryAttempt(attempt)} className={`w-full p-4 text-left transition ${isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div className="font-semibold text-slate-800">Attempt {attempt.attemptNumber || 1}</div>
                    <div className="text-sm text-slate-600">{attempt.attemptedAt ? new Date(attempt.attemptedAt).toLocaleString() : 'Unknown time'}</div>
                  </div>
                  <div className="text-sm text-slate-600 mt-1">{attempt.gradeStatus === 'needs_teacher_review' ? 'Needs teacher review' : 'AI graded'}</div>
                </button>
              );
            })}
          </div>
        )}

        {activeHistoryAttempt ? (
          <div className="space-y-4">
            {(questions.length > 0 ? questions.map((q) => q.id).filter(Boolean) : Object.keys(activeHistoryAttempt.answers || {})).map((questionId, index) => {
              const question = questionLookup[questionId] || { id: questionId, text: `Question ID: ${questionId}` };
              const answer = activeHistoryAttempt.answers?.[questionId] || '';
              const evaluation = activeHistoryAttempt.evaluations?.[questionId];
              return (
                <div key={questionId || `history-q-${index}`} className="p-6 bg-white rounded-xl shadow-lg border border-slate-100 space-y-4">
                  <div><div className="text-sm font-semibold text-slate-500 mb-2">Question {index + 1}</div><div className="mb-4 p-4 border border-slate-200 rounded-lg bg-slate-50"><MathRenderer text={question.text || ''} /></div></div>
                  <div><div className="text-sm font-semibold text-slate-500 mb-2">Your Submitted Answer</div><div className="p-4 border border-slate-200 rounded-lg bg-white">{answer.trim() ? <MathRenderer text={answer} /> : <span className="text-slate-500 text-sm">No answer provided.</span>}</div></div>
                  {evaluation ? <div className={`p-4 rounded-xl text-sm border ${evaluation.isCorrect ? 'bg-green-50 text-green-800 border-green-100' : 'bg-red-50 text-red-800 border-red-100'}`}><div className="font-bold">{evaluation.isCorrect ? 'Correct' : 'Needs Review'}</div><div className="mt-1">{evaluation.feedback || 'No feedback available.'}</div></div> : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4"><BookOpen className="w-7 h-7 text-indigo-600" /><h1 className="text-2xl font-extrabold text-slate-800">{isTeacherPreview ? 'Student Preview' : 'Student View'}</h1></div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-600 hidden sm:block">Logged in as <span className="font-semibold">{user.displayName || user.email}</span></div>
            {isTeacherPreview && onReturnToTeacher ? <button onClick={onReturnToTeacher} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition"><Users className="w-4 h-4" /> Teacher Mode</button> : null}
            <button onClick={handleLogout} className="bg-red-50 text-red-700 p-2 rounded-lg hover:bg-red-100 transition"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {view === 'list' && renderQuizList()}
        {(view === 'quiz' || view === 'results') && activeQuiz && renderQuizTaking()}
        {view === 'history' && activeQuiz && renderAttemptHistory()}
      </main>
    </div>
  );
};

export { StudentView };
