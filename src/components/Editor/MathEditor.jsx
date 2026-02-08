import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, GripVertical, Shuffle, Eye, EyeOff } from 'lucide-react';
import { MathRenderer } from './MathRenderer';
import { EditorToolbar } from './EditorToolbar';

// --- DEBOUNCED QUESTION EDITOR ---
const QuestionEditor = ({ question, index, onChange, onDelete }) => {
    // 1. FAST STATE: Updates instantly so typing feels responsive
    const [localText, setLocalText] = useState(question.text);
    const textareaRef = useRef(null);

    // Sync local state if the parent question changes (e.g. loading a saved quiz)
    useEffect(() => {
        setLocalText(question.text);
    }, [question.id]); 

    // 2. SLOW UPDATE: The "Debounce" Logic
    // This waits 500ms after you STOP typing before updating the actual quiz data
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localText !== question.text) {
                onChange({ ...question, text: localText });
            }
        }, 500); // <--- THE SPEED LIMIT (0.5 seconds)

        return () => clearTimeout(timer);
    }, [localText, question, onChange]);

    // Toolbar Helper (Updates Fast State)
    const handleInsert = (startTag, endTag) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const before = text.substring(0, start);
        const selection = text.substring(start, end);
        const after = text.substring(end);
        
        const newText = before + startTag + (selection || "text") + endTag + after;
        
        setLocalText(newText);
        
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + startTag.length, end + startTag.length + (selection ? 0 : 4));
        }, 0);
    };

    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm transition hover:shadow-md hover:border-indigo-300">
            {/* Header */}
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                <span className="font-bold text-slate-400 text-xs uppercase tracking-wider flex gap-2 items-center">
                    <GripVertical className="w-4 h-4 cursor-grab active:cursor-grabbing"/> Question {index + 1}
                </span>
                <div className="flex gap-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer bg-white px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">
                        <input 
                            type="checkbox" 
                            className="accent-indigo-600"
                            checked={question.showFeedback} 
                            onChange={(e) => onChange({...question, showFeedback: e.target.checked})}
                        /> 
                        AI Feedback
                    </label>
                    <button onClick={onDelete} className="text-slate-400 hover:text-red-500 transition p-1 rounded hover:bg-red-50">
                        <Trash2 className="w-4 h-4"/>
                    </button>
                </div>
            </div>

            {/* Split View */}
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                {/* Editor Column (Uses FAST localText) */}
                <div className="flex flex-col h-full bg-slate-50/50">
                    <EditorToolbar onInsert={handleInsert} />
                    <textarea 
                        ref={textareaRef}
                        className="flex-1 p-4 w-full bg-transparent resize-y min-h-[150px] outline-none font-mono text-sm text-slate-700"
                        placeholder="Type your question here..."
                        value={localText} 
                        onChange={(e) => setLocalText(e.target.value)}
                    />
                </div>

                {/* Preview Column (Uses SLOW question.text) */}
                <div className="p-4 bg-white min-h-[150px]">
                    <div className="flex justify-between items-center mb-2">
                         <div className="text-[10px] font-bold text-slate-300 uppercase">Live Preview</div>
                         {/* Visual indicator that we are waiting for the debounce */}
                         {localText !== question.text && (
                             <span className="text-[10px] text-indigo-400 font-bold animate-pulse">Refreshing...</span>
                         )}
                    </div>
                    {/* This only updates when the timer fires! */}
                    <MathRenderer text={question.text || "*(Preview appears here)*"} />
                </div>
            </div>
        </div>
    );
};

// --- MAIN EDITOR (No logic changes, just structure) ---
export const MathEditor = ({ quiz, setQuiz, isTeacher }) => {
    if (!quiz) return null;

    const updateQuestion = (index, newQ) => {
        const newQuestions = [...quiz.questions];
        newQuestions[index] = newQ;
        setQuiz({ ...quiz, questions: newQuestions });
    };

    const addQuestion = () => {
        const newQ = { 
            id: 'q-' + Date.now(), 
            text: "", 
            showFeedback: true 
        };
        setQuiz({ ...quiz, questions: [...(quiz.questions || []), newQ] });
    };

    const deleteQuestion = (index) => {
        const newQuestions = quiz.questions.filter((_, i) => i !== index);
        setQuiz({ ...quiz, questions: newQuestions });
    };

    return (
        <div className="space-y-6">
            {/* Global Settings */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Quiz Title</label>
                    <input 
                        className="w-full text-xl font-bold border-b border-slate-200 pb-2 outline-none focus:border-indigo-500 transition text-slate-800" 
                        value={quiz.title} 
                        onChange={(e) => setQuiz({...quiz, title: e.target.value})} 
                        placeholder="Enter quiz title..."
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Description / Instructions</label>
                    <input 
                        className="w-full text-sm text-slate-600 border-b border-slate-200 pb-2 outline-none focus:border-indigo-500 transition" 
                        value={quiz.description || ""} 
                        onChange={(e) => setQuiz({...quiz, description: e.target.value})} 
                        placeholder="Brief instructions for students..."
                    />
                </div>

                <div className="flex flex-wrap gap-4 pt-2">
                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold border bg-white text-slate-600 border-slate-200">
                        Max Attempts
                        <input
                            type="number"
                            min={1}
                            className="w-16 text-center border border-slate-300 rounded px-2 py-1 text-sm"
                            value={quiz.maxAttempts ?? 1}
                            onChange={(e) => {
                                const parsed = Number(e.target.value);
                                const safeValue = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
                                setQuiz({ ...quiz, maxAttempts: safeValue });
                            }}
                        />
                    </label>
                    <button
                        onClick={() => setQuiz({ ...quiz, prefillFromLastAttempt: !quiz.prefillFromLastAttempt })}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold border transition ${quiz.prefillFromLastAttempt ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200'}`}
                    >
                        {quiz.prefillFromLastAttempt ? 'Prefill Enabled' : 'Prefill Disabled'}
                    </button>
                    <button 
                        onClick={() => setQuiz({...quiz, allowShuffle: !quiz.allowShuffle})}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold border transition ${quiz.allowShuffle ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200'}`}
                    >
                        <Shuffle className="w-4 h-4"/> {quiz.allowShuffle ? 'Questions Shuffled' : 'Fixed Order'}
                    </button>
                    <button 
                        onClick={() => setQuiz({...quiz, isLocked: !quiz.isLocked})}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold border transition ${quiz.isLocked ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}
                    >
                        {quiz.isLocked ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>} 
                        {quiz.isLocked ? 'Quiz Hidden' : 'Quiz Visible'}
                    </button>
                </div>
            </div>

            {/* Questions List */}
            <div className="space-y-4">
                {quiz.questions?.map((q, i) => (
                    <QuestionEditor 
                        key={q.id} 
                        index={i} 
                        question={q} 
                        onChange={(newQ) => updateQuestion(i, newQ)}
                        onDelete={() => deleteQuestion(i)}
                    />
                ))}
            </div>

            <button 
                onClick={addQuestion} 
                className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 flex justify-center items-center gap-2 font-bold transition group"
            >
                <div className="p-1 bg-slate-200 rounded-full text-white group-hover:bg-indigo-600 transition">
                    <Plus className="w-5 h-5"/>
                </div>
                Add New Question
            </button>
        </div>
    );
};
