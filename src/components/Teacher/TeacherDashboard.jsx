import React, { useState } from 'react';
import { BookOpen, Edit3, Plus, Trash2, Save, Users, Loader2, LogOut, LayoutList, Lock, Shuffle, Eye } from 'lucide-react';
import { doc, setDoc, deleteDoc, db, useQuizzes, useTeacherSubmissions, collection } from '../../services/firebaseService';
import { MathEditor } from '../Editor/MathEditor';
import { MathRenderer } from '../Editor/MathRenderer';

const buildQuizPayload = (quiz, user) => {
    const normalizedQuestions = Array.isArray(quiz.questions)
        ? quiz.questions.map((question, index) => ({
            id: question?.id || `q-${Date.now()}-${index}`,
            text: question?.text || '',
            showFeedback: !!question?.showFeedback,
        }))
        : [];

    const parsedAttempts = Number(quiz.maxAttempts ?? 1);
    const maxAttempts = Number.isFinite(parsedAttempts) && parsedAttempts > 0
        ? Math.floor(parsedAttempts)
        : 1;

    return {
        title: quiz.title || 'Untitled Quiz',
        description: quiz.description || '',
        isLocked: !!quiz.isLocked,
        maxAttempts,
        prefillFromLastAttempt: !!quiz.prefillFromLastAttempt,
        questions: normalizedQuestions,
        allowShuffle: quiz.allowShuffle !== false,
        allowReview: quiz.allowReview !== false,
        teacherId: user.uid,
        teacherName: user.displayName || user.email || '',
        updatedAt: new Date().toISOString(),
    };
};

export const TeacherDashboard = ({ user, handleLogout }) => {
    const quizzes = useQuizzes(user.uid);
    const submissions = useTeacherSubmissions(user.uid);
    const [view, setView] = useState('list'); // 'list', 'edit', 'new', 'submission'
    const [activeQuiz, setActiveQuiz] = useState(null);
    const [activeSubmission, setActiveSubmission] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // --- CRUD Operations ---

    const startNewQuiz = () => {
        setActiveQuiz({
            title: 'New Quiz Title',
            description: 'A brief description of this math quiz.',
            isLocked: false,
            maxAttempts: 1,
            prefillFromLastAttempt: false,
            questions: [
                { id: 'q-' + Date.now(), text: 'What is the value of $x$ in the equation $2x + 5 = 15$?', showFeedback: true }
            ],
            allowShuffle: true,
            allowReview: true,
            teacherId: user.uid,
            teacherName: user.displayName || user.email,
        });
        setView('new');
    };

    const startEditQuiz = (quiz) => {
        setActiveQuiz(quiz);
        setView('edit');
    };

    const startReviewSubmission = (submission) => {
        setActiveSubmission(submission);
        setView('submission');
    };

    const saveQuiz = async () => {
        if (!activeQuiz || !db) return;
        setIsSaving(true);
        const quizData = buildQuizPayload(activeQuiz, user);

        try {
            if (view === 'edit' && activeQuiz.teacherId && activeQuiz.teacherId !== user.uid) {
                throw new Error('You can only edit quizzes you own.');
            }

            if (view === 'new') {
                const newRef = doc(collection(db, 'quizzes'));
                await setDoc(newRef, {
                    ...quizData,
                    createdAt: new Date().toISOString(),
                });
            } else {
                await setDoc(doc(db, 'quizzes', activeQuiz.id), quizData);
            }
            alert('Quiz saved successfully!');
            setView('list');
            setActiveQuiz(null);
        } catch (error) {
            console.error('Error saving quiz:', error);
            const permissionDenied =
                error?.code === 'permission-denied' ||
                String(error?.message || '').toLowerCase().includes('missing or insufficient permissions');

            if (permissionDenied) {
                alert('Failed to save quiz: Firestore rules denied write access. Ensure your signed-in teacher account is allowed to write to the quizzes collection.');
            } else {
                alert(`Failed to save quiz: ${error?.message || 'Unknown error'}`);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const deleteQuiz = async (quizId) => {
        if (window.confirm('Are you sure you want to delete this quiz?')) {
            try {
                await deleteDoc(doc(db, 'quizzes', quizId));
            } catch (error) {
                console.error('Error deleting quiz:', error);
                alert('Failed to delete quiz.');
            }
        }
    };

    // --- Rendering Logic ---

    const renderQuizList = () => (
        <div className="space-y-4">
            <h2 className="text-3xl font-extrabold text-slate-800 mb-6 flex items-center justify-between">
                Your Quizzes ({quizzes.length})
                <button onClick={startNewQuiz} className="bg-indigo-600 text-white p-3 rounded-full hover:bg-indigo-700 transition shadow-lg flex items-center gap-2 px-6">
                    <Plus className="w-5 h-5" /> New Quiz
                </button>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {quizzes.length === 0 ? (
                    <div className="col-span-3 text-center p-12 bg-white rounded-xl shadow-lg border border-slate-200 text-slate-500">
                        <LayoutList className="w-8 h-8 mx-auto mb-3" />
                        <p className="font-bold">No Quizzes Found</p>
                        <p>Click "New Quiz" to get started.</p>
                    </div>
                ) : (
                    quizzes.map((quiz) => (
                        <div key={quiz.id} className="bg-white p-6 rounded-xl shadow-lg border border-slate-100 hover:shadow-xl transition flex flex-col justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 mb-2 truncate">{quiz.title}</h3>
                                <div className="text-sm text-slate-600 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <BookOpen className="w-4 h-4 text-indigo-500" />
                                        <span>{quiz.questions?.length || 0} Questions</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {quiz.isLocked ? <Lock className="w-4 h-4 text-red-500" /> : <BookOpen className="w-4 h-4 text-green-500" />}
                                        <span>{quiz.isLocked ? 'Locked' : 'Active'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Shuffle className="w-4 h-4 text-amber-500" />
                                        <span>Max Attempts: {quiz.maxAttempts ?? 1}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-4 flex gap-2 pt-4 border-t border-slate-100">
                                <button onClick={() => startEditQuiz(quiz)} className="flex-1 flex items-center justify-center p-3 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg font-semibold hover:bg-indigo-100 transition text-sm">
                                    <Edit3 className="w-4 h-4 mr-2" /> Edit
                                </button>
                                <button onClick={() => deleteQuiz(quiz.id)} className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition text-sm">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-8 bg-white rounded-xl shadow-lg border border-slate-100">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-slate-800">Recent Student Submissions</h3>
                    <span className="text-sm text-slate-500">{submissions.length} total</span>
                </div>

                {submissions.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">No submissions yet for your quizzes.</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {submissions.slice(0, 10).map((submission) => (
                            <div key={submission.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <div>
                                    <div className="font-semibold text-slate-800">{submission.quizTitle || 'Untitled Quiz'}</div>
                                    <div className="text-sm text-slate-600">
                                        {submission.studentName || submission.studentEmail || 'Unknown Student'} - Attempt {submission.attemptNumber || 1}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-sm text-slate-600">
                                        {submission.gradeStatus === 'needs_teacher_review' ? 'Needs teacher review' : 'AI graded'} - {submission.attemptedAt ? new Date(submission.attemptedAt).toLocaleString() : 'Unknown time'}
                                    </div>
                                    <button
                                        onClick={() => startReviewSubmission(submission)}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg font-semibold hover:bg-indigo-100 transition text-sm"
                                    >
                                        <Eye className="w-4 h-4" /> Review
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    const renderSubmissionReview = () => {
        if (!activeSubmission) return null;

        const sourceQuiz = quizzes.find((quiz) => quiz.id === activeSubmission.quizId);
        const questions = Array.isArray(sourceQuiz?.questions) ? sourceQuiz.questions : [];
        const questionList = questions.length > 0
            ? questions
            : Object.keys(activeSubmission.answers || {}).map((id) => ({ id, text: `Question ID: ${id}` }));

        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-3xl font-extrabold text-slate-800">Submission Review</h2>
                    <button onClick={() => setView('list')} className="flex items-center gap-2 py-2 px-4 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition font-semibold">
                        <Users className="w-5 h-5" /> Back to Dashboard
                    </button>
                </div>

                <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-6 space-y-2">
                    <div className="text-lg font-bold text-slate-800">{activeSubmission.quizTitle || 'Untitled Quiz'}</div>
                    <div className="text-sm text-slate-600">Student: {activeSubmission.studentName || activeSubmission.studentEmail || 'Unknown Student'}</div>
                    <div className="text-sm text-slate-600">Attempt: {activeSubmission.attemptNumber || 1}</div>
                    <div className="text-sm text-slate-600">Status: {activeSubmission.gradeStatus === 'needs_teacher_review' ? 'Needs teacher review' : 'AI graded'}</div>
                    <div className="text-sm text-slate-600">Submitted: {activeSubmission.attemptedAt ? new Date(activeSubmission.attemptedAt).toLocaleString() : 'Unknown time'}</div>
                </div>

                <div className="space-y-4">
                    {questions.length === 0 ? (
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm">
                            Could not load the original quiz questions for this submission. Student answers are shown below by question id.
                        </div>
                    ) : null}

                    {questionList.map((question, index) => {
                        const answerText = activeSubmission.answers?.[question.id] || '';
                        const evaluation = activeSubmission.evaluations?.[question.id];

                        return (
                            <div key={question.id || `q-${index}`} className="bg-white rounded-xl shadow-lg border border-slate-100 p-6 space-y-4">
                                <div>
                                    <div className="text-sm font-semibold text-slate-500 mb-2">Question {index + 1}</div>
                                    <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                                        <MathRenderer text={question.text || ''} />
                                    </div>
                                </div>

                                <div>
                                    <div className="text-sm font-semibold text-slate-500 mb-2">Student Answer</div>
                                    <div className="p-4 border border-slate-200 rounded-lg bg-white">
                                        {answerText.trim() ? <MathRenderer text={answerText} /> : <span className="text-slate-500 text-sm">No answer provided.</span>}
                                    </div>
                                </div>

                                {evaluation ? (
                                    <div className={`p-4 rounded-lg border text-sm ${evaluation.isCorrect ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                                        <div className="font-semibold">{evaluation.isCorrect ? 'Marked Correct' : 'Marked Needs Review'}</div>
                                        <div className="mt-1">{evaluation.feedback || 'No feedback available.'}</div>
                                    </div>
                                ) : null}
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
                    <button onClick={() => setView('list')} className="flex items-center gap-2 py-2 px-4 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition font-semibold">
                        <Users className="w-5 h-5" /> View Quizzes
                    </button>
                    <button onClick={saveQuiz} disabled={isSaving} className="flex items-center gap-2 py-2 px-6 bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-200 hover:bg-green-700 transition disabled:opacity-70 disabled:shadow-none">
                        {isSaving ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
                        {isSaving ? 'Saving...' : 'Save Quiz'}
                    </button>
                </div>
            </h2>

            <MathEditor
                quiz={activeQuiz}
                setQuiz={setActiveQuiz}
                isTeacher={true}
            />
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <BookOpen className="w-7 h-7 text-indigo-600" />
                        <h1 className="text-2xl font-extrabold text-slate-800">Teacher Dashboard</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-semibold text-slate-600 hidden sm:block">{user.displayName || user.email}</span>
                        <button onClick={handleLogout} className="bg-red-50 text-red-700 p-2 rounded-lg hover:bg-red-100 transition">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {view === 'list' && renderQuizList()}
                {(view === 'edit' || view === 'new') && activeQuiz && renderQuizEditor()}
                {view === 'submission' && activeSubmission && renderSubmissionReview()}
            </main>
        </div>
    );
};
