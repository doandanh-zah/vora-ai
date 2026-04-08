import { useState } from 'react';
import { Sparkles, MessageSquare, Send, CheckCircle2 } from 'lucide-react';

export const Step6HatchTest = ({ onFinish, onHatchTest }: { 
  onFinish: () => void; 
  onHatchTest: (prompt: string) => Promise<string>;
}) => {
  const [prompt, setPrompt] = useState('Wake up, my friend!');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTest = async () => {
    setLoading(true);
    try {
      const res = await onHatchTest(prompt);
      setResponse(res);
    } catch (e) {
      setResponse("Error: Could not connect to the assistant.");
    }
    setLoading(false);
  };

  return (
    <div className="step-card glass-panel flex flex-col items-center animate-in slide-in-from-right-4 fade-in duration-500">
      <div className="w-16 h-16 rounded-full bg-yellow-400/20 flex items-center justify-center mb-6">
        <Sparkles className="w-8 h-8 text-yellow-400" />
      </div>
      <h2 className="text-2xl font-bold mb-4 text-center tracking-tight uppercase tracking-widest text-yellow-400">HATCH TEST</h2>
      <p className="text-white/60 text-center text-sm mb-8">Send a prompt to verify your AI setup is working correctly.</p>

      <div className="w-full space-y-4 mb-10">
        <div className="relative">
          <MessageSquare className="absolute left-4 top-4 text-white/20" size={20} />
          <textarea 
            className="form-input pl-12 pt-4 min-h-[100px] resize-none"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        {response && (
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 animate-in fade-in zoom-in duration-300">
             <p className="text-xs font-bold text-white/30 uppercase tracking-widest mb-2">Assistant Reply</p>
             <p className="text-sm italic">{response}</p>
          </div>
        )}

        <button 
          onClick={handleTest}
          disabled={loading}
          className="w-full py-4 bg-white/10 border border-white/20 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition-all"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
          ) : (
            <>
              Run Test <Send size={18} />
            </>
          )}
        </button>
      </div>

      <button 
        onClick={onFinish}
        disabled={!response || loading}
        className={`btn-primary w-full py-4 flex items-center justify-center gap-2 ${(!response || loading) ? 'opacity-50 grayscale' : ''}`}
      >
        Complete Setup <CheckCircle2 size={18} />
      </button>
    </div>
  );
};
