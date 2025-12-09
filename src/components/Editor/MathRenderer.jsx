import React, { useState, useEffect, useRef } from 'react';

// --- KaTeX Setup ---
const useKaTeX = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    // Check for Katex existence first
    if (window.katex) { setIsLoaded(true); return; }
    
    // Dynamically load the CSS
    const link = document.createElement('link'); 
    link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"; 
    link.rel = "stylesheet"; 
    link.crossOrigin = "anonymous"; 
    document.head.appendChild(link);
    
    // Dynamically load the JS
    const script = document.createElement('script'); 
    script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"; 
    script.crossOrigin = "anonymous"; 
    script.onload = () => setIsLoaded(true); 
    document.body.appendChild(script);
  }, []);
  return isLoaded;
};

// --- Custom Markdown Parsers ---
const parseBold = (text) => {
    if (!text) return null;
    const parts = text.split(/\*\*(.*?)\*\*/g);
    if (parts.length === 1) return text;
    return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-extrabold text-slate-900">{part}</strong> : part);
};

const parseLinks = (text) => {
    if (!text) return null;
    const linkRegex = /\[(.*?)\]\((.*?)\)/g;
    const parts = text.split(linkRegex);
    if (parts.length === 1) return parseBold(text);
    const result = [];
    for (let i = 0; i < parts.length; i += 3) {
        result.push(<span key={`t-${i}`}>{parseBold(parts[i])}</span>);
        if (i + 2 < parts.length) {
            result.push(<a key={`l-${i}`} href={parts[i+2]} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline font-bold mx-1">{parseBold(parts[i+1])}</a>);
        }
    }
    return result;
};

const parseMarkdown = (text) => {
    if (!text) return null;
    const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
    const parts = text.split(imgRegex);
    if (parts.length === 1) return parseLinks(text);
    const result = [];
    for (let i = 0; i < parts.length; i += 3) {
        result.push(<span key={`b-${i}`}>{parseLinks(parts[i])}</span>);
        if (i + 2 < parts.length) {
            result.push(<img key={`img-${i}`} src={parts[i+2]} alt={parts[i+1]} className="max-w-full h-auto rounded-lg shadow-sm my-4 border border-slate-200 block" />);
        }
    }
    return result;
};

// --- Main Renderer Component ---
export const MathRenderer = ({ text }) => {
  const loaded = useKaTeX();
  if (!loaded) return <span className="text-slate-400 text-xs">Loading math...</span>;
  if (!text) return null;
  const safeText = String(text);
  
  // Splits by block math ( $$...$$ )
  const blockParts = safeText.split(/(\$\$[\s\S]*?\$\$)/g);
  
  return (
    <div className="text-slate-700 leading-relaxed whitespace-pre-wrap">
      {blockParts.map((part, index) => {
        if (part.startsWith('$$')) {
            // Block Math rendering
            const math = part.slice(2, -2);
            return <div key={index} className="my-4 text-center overflow-x-auto p-1" ref={node => { if (node && window.katex) try { window.katex.render(math, node, { displayMode: true, throwOnError: false }); } catch (e) { node.textContent = e.message; } }} />;
        } else {
            // Inline/Standard Markdown parsing
            const inlineParts = part.split(/(\$[\s\S]*?\$)/g);
            return <span key={index}>{inlineParts.map((subPart, subIndex) => {
                if (subPart.startsWith('$')) {
                    // Inline Math rendering ( $...$ )
                    const math = subPart.slice(1, -1);
                    return <span key={subIndex} className="mx-0.5 inline-block" ref={node => { if (node && window.katex) try { window.katex.render(math, node, { displayMode: false, throwOnError: false }); } catch (e) { node.textContent = e.message; } }} />;
                } else {
                    // Standard Markdown processing
                    return <span key={subIndex}>{parseMarkdown(subPart)}</span>;
                }
            })}</span>;
        }
      })}
    </div>
  );
};