import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';

// --- SAGE CELL COMPONENT (Stable) ---
// We keep React.memo here as a second layer of defense
const SageCell = React.memo(({ code }) => {
    const nodeRef = useRef(null);
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        if (!window.sagecell) return;
        if (initialized) return;

        try {
            window.sagecell.makeSagecell({
                inputLocation: nodeRef.current,
                evalButtonText: 'Evaluate',
            });
            setInitialized(true);
        } catch (e) {
            console.error("Sage init error:", e);
        }
    }, [initialized]);

    return (
        <div className="my-4 border border-slate-200 rounded p-1 bg-white shadow-sm not-prose">
            <div ref={nodeRef} className="sage-compute">
                <script type="text/x-sage">
                    {code}
                </script>
            </div>
        </div>
    );
}, (prev, next) => prev.code === next.code);

// --- MARKDOWN COMPONENTS CONFIGURATION ---
// MOVED OUTSIDE: This object is now static constant. 
// It will NEVER trigger a re-render.
const MARKDOWN_COMPONENTS = {
    code: ({ node, inline, className, children, ...props }) => {
        const match = /language-(\w+)/.exec(className || '');
        const isSage = match && match[1] === 'sage';

        if (!inline && isSage) {
            const codeContent = String(children).replace(/\n$/, '');
            return <SageCell code={codeContent} />;
        }

        return !inline ? (
            <div className="bg-slate-100 p-3 rounded-lg overflow-x-auto my-3 border border-slate-200 font-mono text-sm">
                <code className={className} {...props}>
                    {children}
                </code>
            </div>
        ) : (
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm font-mono text-indigo-600" {...props}>
                {children}
            </code>
        );
    },
    h1: ({node, ...props}) => <h1 className="text-2xl font-bold mt-6 mb-4 text-slate-800" {...props} />,
    h2: ({node, ...props}) => <h2 className="text-xl font-bold mt-5 mb-3 text-slate-800" {...props} />,
    h3: ({node, ...props}) => <h3 className="text-lg font-bold mt-4 mb-2 text-slate-800" {...props} />,
    ul: ({node, ...props}) => <ul className="list-disc pl-6 space-y-1 mb-4" {...props} />,
    ol: ({node, ...props}) => <ol className="list-decimal pl-6 space-y-1 mb-4" {...props} />,
    p: ({node, ...props}) => <p className="mb-4 last:mb-0" {...props} />,
    a: ({node, ...props}) => <a className="text-indigo-600 hover:underline font-bold" target="_blank" rel="noopener noreferrer" {...props} />,
    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-indigo-200 pl-4 italic my-4 text-slate-600" {...props} />,
    table: ({node, ...props}) => <div className="overflow-x-auto my-4"><table className="min-w-full divide-y divide-slate-200 border border-slate-200" {...props} /></div>,
    th: ({node, ...props}) => <th className="bg-slate-50 px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider font-bold" {...props} />,
    td: ({node, ...props}) => <td className="px-4 py-2 whitespace-nowrap text-sm text-slate-600 border-t border-slate-200" {...props} />,
    img: ({node, ...props}) => <img className="max-w-full h-auto rounded-lg shadow-sm my-4 border border-slate-200" {...props} />,
};

// --- MAIN RENDERER ---
// WRAPPED IN MEMO: This component will now IGNORE parent re-renders 
// unless the 'text' prop literally changes.
export const MathRenderer = React.memo(({ text }) => {
    if (!text) return null;

    return (
        <div className="text-slate-700 leading-relaxed">
            <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
                components={MARKDOWN_COMPONENTS}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}, (prevProps, nextProps) => {
    // Return TRUE if props are equal (do not re-render)
    // Return FALSE if props changed (re-render)
    return prevProps.text === nextProps.text;
});