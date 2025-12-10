import React from 'react';
import { Bold, Italic, Calculator, Image as ImageIcon } from 'lucide-react';

export const EditorToolbar = ({ onInsert }) => (
    <div className="flex flex-wrap gap-1 p-2 bg-slate-100 border-b border-slate-200 rounded-t-lg">
        <button onClick={() => onInsert('**', '**')} className="p-1.5 text-slate-600 hover:bg-slate-200 rounded" title="Bold"><Bold className="w-4 h-4"/></button>
        <button onClick={() => onInsert('*', '*')} className="p-1.5 text-slate-600 hover:bg-slate-200 rounded" title="Italic"><Italic className="w-4 h-4"/></button>
        <div className="w-px h-6 bg-slate-300 mx-1"></div>
        <button onClick={() => onInsert('$', '$')} className="p-1.5 text-slate-600 hover:bg-slate-200 rounded font-serif font-bold" title="Inline Math">$\dots$</button>
        <button onClick={() => onInsert('$$', '$$')} className="p-1.5 text-slate-600 hover:bg-slate-200 rounded font-serif font-bold" title="Block Math">$$</button>
        <button onClick={() => onInsert('\n```sage\n', '\n```\n')} className="p-1.5 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 rounded flex gap-1 items-center" title="SageMath Cell">
            <Calculator className="w-4 h-4"/> <span className="text-[10px] font-bold">SAGE</span>
        </button>
        <div className="w-px h-6 bg-slate-300 mx-1"></div>
        <button onClick={() => onInsert('![Alt Text](', ')')} className="p-1.5 text-slate-600 hover:bg-slate-200 rounded" title="Image"><ImageIcon className="w-4 h-4"/></button>
    </div>
);