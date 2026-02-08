import React, { useState } from 'react';
import { BookOpen, LogOut, CheckCircle, XCircle, Loader2, Shuffle, AlertTriangle, LayoutList } from 'lucide-react';
import { addDoc, collection, db, useQuizzes, useStudentSubmissions } from '../../services/firebaseService';
import { gradeSubmission } from '../../services/aiService';
import { MathRenderer } from '../Editor/MathRenderer';

const StudentView = ({ user, handleLogout }) => {
    // Fetches all available quizzes
    const allQuizzes = useQuizzes(user.uid);
    const submissionSummary = useStudentSubmissions(user.uid);
    // Filter to only show unlocked quizzes
    const quizzes = allQuizzes.filter(q => !q.isLocked);

    const [view, setView] = useState('list'); // 'list', 'quiz', 'results'
    const [activeQuiz, setActiveQuiz] = useState(null);
    const [studentAnswers, setStudentAnswers] = useState({});
    const [gradingResult, setGradingResult] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [viewingResult, setViewingResult] = useState(false);
    const [shuffledQuestions, setShuffledQuestions] = useState([]);

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

    // --- Quiz Lifecycle ---

    const startQuiz = (quiz) => {
        const { remainingAttempts } = getAttemptInfo(quiz);
        if (remainingAttempts <= 0) {
            alert('No attempts remaining for this quiz.');
            return;
        }

        // Reset state for new quiz
        setActiveQuiz(quiz);
        const latestAnswers = submissionSummary?.[quiz.id]?.latestAnswers || {};
        const shouldPrefill = !!quiz.prefillFromLastAttempt;
        setStudentAnswers(shouldPrefill ? latestAnswers : {});
        setGradingResult(null);
        setViewingResult(false);

        // Handle shuffling
        if (quiz.allowShuffle) {
            const shuffled = [...quiz.questions].sort(() => Math.random() - 0.5);
            setShuffledQuestions(shuffled);
        } else {
            setShuffledQuestions(quiz.questions);
        }

        setView('quiz');
    };

    const submitQuiz = async () => {
        if (!activeQuiz || isSubmitting) return;
        const { maxAttempts, usedAttempts, remainingAttempts } = getAttemptInfo(activeQuiz);
        if (remainingAttempts <= 0) {
            alert('Attempt limit reached for this quiz.');
            return;
        }

        // Simple check to ensure all questions were attempted
        const answeredCount = Object.keys(studentAnswers).filter(key => studentAnswers[key].trim() !== '').length;
        if (answeredCount < activeQuiz.questions.length) {
            if (!window.confirm(`You have only answered ${answeredCount} of ${activeQuiz.questions.length} questions. Submit anyway?`)) {
                return;
            }
        }

        setIsSubmitting(true);
        setViewingResult(false);

        // Call the secure serverless function
        const gradingData = await gradeSubmission(activeQuiz, studentAnswers);

        if (gradingData && gradingData.evaluations) {
            setGradingResult(gradingData.evaluations);
            setViewingResult(true);
            setView('results');
            const attemptNumber = usedAttempts + 1;

            try {
                await addDoc(collection(db, 'submissions'), {
                    quizId: activeQuiz.id,
                    quizTitle: activeQuiz.title,
                    studentId: user.uid,
                    studentEmail: user.email || '',
                    studentName: user.displayName || user.email || '',
                    answers: studentAnswers,
                    evaluations: gradingData.evaluations,
                    attemptNumber,
                    maxAttemptsAtSubmission: maxAttempts,
                    attemptedAt: new Date().toISOString(),
                });
            } catch (saveError) {
                console.error('Failed to save submission:', saveError);
            }
        }

        setIsSubmitting(false);
    };
    
    // Handler for updating student input
    const handleAnswerChange = (questionId, value) => {
        setStudentAnswers(prev => ({
            ...prev,
            [questionId]: value,
        }));
    };

    // --- Rendering Logic ---
    const renderQuizList = () => (
        <div className="space-y-4">
            <h2 className="text-3xl font-extrabold text-slate-800 mb-6 flex items-center justify-between">
                Available Quizzes ({quizzes.length})
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {quizzes.length === 0 ? (
                    <div className="col-span-3 text-center p-12 bg-white rounded-xl shadow-lg border border-slate-200 text-slate-500">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-3" />
                        <p className="font-bold">No Quizzes Available</p>
                        <p>Your teacher has not published any quizzes yet.</p>
                    </div>
                ) : (
                    quizzes.map((quiz) => (
                        <div key={quiz.id} className="bg-white p-6 rounded-xl shadow-lg border border-slate-100 hover:shadow-xl transition flex flex-col justify-between">
                            {(() => {
                                const { maxAttempts, usedAttempts, remainingAttempts } = getAttemptInfo(quiz);
                                const attemptsExhausted = remainingAttempts <= 0;
                                return (
                                    <>
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2 truncate">{quiz.title}</h3>
                                <p className="text-sm text-slate-500 mb-4 line-clamp-2">{quiz.description}</p>
                                <div className="text-sm text-slate-600 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-indigo-500" />
                                        <span>{quiz.questions?.length || 0} Questions</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {quiz.allowShuffle ? <Shuffle className="w-4 h-4 text-orange-500" /> : <LayoutList className="w-4 h-4 text-slate-500" />}
                                        <span>{quiz.allowShuffle ? 'Questions are shuffled' : 'Fixed order'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className={`w-4 h-4 ${attemptsExhausted ? 'text-red-500' : 'text-green-500'}`} />
                                        <span>
                                            Attempts: {usedAttempts}/{maxAttempts} ({remainingAttempts} remaining)
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 flex gap-2 pt-4 border-t border-slate-100">
                                <button
                                    onClick={() => startQuiz(quiz)}
                                    disabled={attemptsExhausted}
                                    className={`flex-1 flex items-center justify-center p-3 rounded-lg font-semibold transition text-sm ${attemptsExhausted ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-indigo-500 text-white hover:bg-indigo-600'}`}
                                >
                                    <BookOpen className="w-4 h-4 mr-2" /> {attemptsExhausted ? 'No Attempts Left' : 'Start Quiz'}
                                </button>
                            </div>
                                    </>
                                );
                            })()}
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    const renderQuizTaking = () => (
        <div className="space-y-6">
            <h2 className="text-3xl font-extrabold text-slate-800 border-b border-slate-200 pb-4 mb-4">
                {activeQuiz.title}
            </h2>
            <p className="text-slate-600 mb-6">{activeQuiz.description}</p>
            
            <div className="space-y-10">
                {shuffledQuestions.map((q, index) => {
                    const ans = studentAnswers[q.id] || '';
                    const result = gradingResult?.[q.id];
                    const questionNumber = index + 1;

                    return (
                        <div key={q.id} className="p-6 bg-white rounded-xl shadow-lg border border-slate-100">
                            <h3 className="text-xl font-bold text-slate-700 mb-4">Question {questionNumber}</h3>
                            
                            {/* Question Text with Math Renderer */}
                            <div className="mb-6 p-4 border border-slate-200 rounded-lg bg-slate-50">
                                <MathRenderer text={q.text} />
                            </div>

                            {/* Answer Input */}
                            <textarea
                                value={ans}
                                onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                rows={4}
                                placeholder="Type your answer here, you can use LaTeX."
                                className="w-full p-4 border border-slate-300 rounded-lg resize-none focus:ring-indigo-500 focus:border-indigo-500 transition disabled:bg-slate-50"
                                disabled={isSubmitting || viewingResult}
                            />

                            {/* Live Preview (Only while typing, not after submission) */}
                            {!viewingResult && ans.trim() !== '' && (
                                <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                                    <span className="text-xs font-bold text-indigo-700 block mb-1">Answer Preview</span>
                                    <MathRenderer text={ans} />
                                </div>
                            )}
                            
                            {/* Grading Result and Feedback */}
                            {viewingResult && result && (
                                <div className={`p-4 rounded-xl flex gap-3 items-start animate-in fade-in slide-in-from-top-2 mt-4 ${result.isCorrect ? "bg-green-50 text-green-800 border border-green-100" : "bg-red-50 text-red-800 border border-red-100"}`}>
                                    {result.isCorrect ? <CheckCircle className="w-5 h-5 mt-0.5 shrink-0"/> : <XCircle className="w-5 h-5 mt-0.5 shrink-0"/>}
                                    <div className="text-sm">
                                        <div className="font-bold">{result.isCorrect ? "Correct" : "Needs Review"}</div>
                                        <div className="opacity-90 mt-1">{result.feedback}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                     )
                })}

                {/* Submit Button */}
                {!viewingResult && (
                    <button onClick={submitQuiz} disabled={isSubmitting} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-0.5 transition flex justify-center items-center gap-2 disabled:opacity-70 disabled:translate-y-0 disabled:shadow-none">
                        {isSubmitting ? <Loader2 className="animate-spin w-5 h-5"/> : <CheckCircle className="w-5 h-5"/>}
                        {isSubmitting ? 'Grading...' : 'Submit Quiz for AI Grade'}
                    </button>
                )}
                
                {/* Back to List Button (After submission) */}
                {viewingResult && (
                    <button onClick={() => setView('list')} className="w-full py-4 bg-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-300 transition flex justify-center items-center gap-2">
                        <BookOpen className="w-5 h-5"/> Back to Quizzes
                    </button>
                )}
            </div>
        </div>
    );

    // --- Main Layout ---
    return (
        <div className="min-h-screen bg-slate-50">
            <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <BookOpen className="w-7 h-7 text-indigo-600" />
                        <h1 className="text-2xl font-extrabold text-slate-800">Student View</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-slate-600 hidden sm:block">
                            Logged in as <span className="font-semibold">{user.displayName || user.email}</span>
                        </div>
                        <button onClick={handleLogout} className="bg-red-50 text-red-700 p-2 rounded-lg hover:bg-red-100 transition">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {view === 'list' && renderQuizList()}
                {(view === 'quiz' || view === 'results') && activeQuiz && renderQuizTaking()}
            </main>
        </div>
    );
};

export { StudentView };
