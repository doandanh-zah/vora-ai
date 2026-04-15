import { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, CheckCircle2, User, Bot } from 'lucide-react';

export const HatchTest = ({ onFinish, onHatchTest }: { 
  onFinish: () => void; 
  onHatchTest: (prompt: string) => Promise<string>;
}) => {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([
    { role: 'assistant', content: "Hello! I'm VORA. My soul is loaded and I'm ready to assist you. How can I help today?" }
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleTest = async () => {
    if (!prompt.trim()) return;
    
    const userMsg = prompt;
    setPrompt('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    
    try {
      const res = await onHatchTest(userMsg);
      setMessages(prev => [...prev, { role: 'assistant', content: res }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Error: I'm having trouble connecting to my brain." }]);
    }
    setLoading(false);
  };

  return (
    <div className="step-card glass-panel flex flex-col items-center animate-in slide-in-from-right-4 fade-in duration-500 max-h-[80vh]">
      <div className="w-full flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
        <div className="w-10 h-10 rounded-full bg-yellow-400/20 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-yellow-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight uppercase text-yellow-400">HATCH TEST</h2>
          <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">Personality & Memory Active</p>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="w-full flex-1 overflow-y-auto pr-2 space-y-4 mb-6 custom-scrollbar min-h-[300px]"
      >
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''} animate-in fade-in slide-in-from-bottom-2`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-white/60'}`}>
              {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className={`p-3 rounded-2xl text-sm max-w-[80%] ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-tr-none' : 'bg-white/5 border border-white/10 text-white/90 rounded-tl-none'}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
             <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center animate-pulse">
               <Bot size={16} className="text-white/40" />
             </div>
             <div className="p-3 bg-white/5 border border-white/10 rounded-2xl rounded-tl-none">
               <div className="flex gap-1">
                 <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce"></div>
                 <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                 <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.4s]"></div>
               </div>
             </div>
          </div>
        )}
      </div>

      <div className="w-full space-y-4">
        <form 
          onSubmit={(e) => { e.preventDefault(); handleTest(); }}
          className="relative"
        >
          <input 
            className="form-input pr-12 py-4"
            placeholder="Talk to VORA..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
          />
          <button 
            type="submit"
            disabled={loading || !prompt.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-yellow-500 hover:text-yellow-400 disabled:opacity-30 disabled:grayscale transition-all"
          >
            <Send size={20} />
          </button>
        </form>

        <button 
          onClick={onFinish}
          disabled={messages.length < 3 || loading}
          className={`btn-primary w-full py-4 flex items-center justify-center gap-2 ${messages.length < 3 ? 'opacity-50 grayscale' : ''}`}
        >
          Complete Setup <CheckCircle2 size={18} />
        </button>
      </div>
    </div>
  );
};
