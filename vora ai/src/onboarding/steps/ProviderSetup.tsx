import { useState, useEffect } from 'react';
import { Key, Download, RefreshCw, CheckCircle2, ExternalLink } from 'lucide-react';

export const ProviderSetup = ({ 
  provider, 
  onNext, 
  onPrev, 
  onSaveKey, 
  onCheckOllama 
}: { 
  provider: 'ollama' | 'groq'; 
  onNext: () => void; 
  onPrev: () => void;
  onSaveKey?: (key: string) => Promise<void>;
  onCheckOllama?: () => Promise<boolean>;
}) => {
  const [key, setKey] = useState('');
  const [ollamaStatus, setOllamaStatus] = useState<'unknown' | 'checking' | 'not_found' | 'ready'>('unknown');

  useEffect(() => {
    if (provider === 'ollama') {
      checkOllama();
    }
  }, [provider]);

  const checkOllama = async () => {
    if (!onCheckOllama) return;
    setOllamaStatus('checking');
    const isInstalled = await onCheckOllama();
    setOllamaStatus(isInstalled ? 'ready' : 'not_found');
  };

  const handleSaveGroq = async () => {
    if (onSaveKey) {
      await onSaveKey(key);
      onNext();
    }
  };

  if (provider === 'groq') {
    return (
      <div className="step-card glass-panel flex flex-col items-center animate-in slide-in-from-right-4 fade-in duration-500">
        <div className="w-16 h-16 rounded-full bg-red-400/20 flex items-center justify-center mb-6">
          <Key className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold mb-4 text-center tracking-tight">GROQ API SETUP</h2>
        <p className="text-white/60 text-center text-sm mb-8">Enter your Groq Cloud API key to continue.</p>
        
        <div className="w-full space-y-4 mb-10">
          <div className="space-y-2">
            <label className="text-xs font-bold text-white/50 uppercase tracking-widest pl-1">Groq API Key</label>
            <input 
              type="password" 
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="gsk_..."
              className="form-input"
            />
          </div>
          <a 
            href="https://console.groq.com/keys" 
            target="_blank" 
            className="flex items-center gap-2 text-xs text-red-400/80 hover:text-red-400"
          >
            <ExternalLink size={14} /> Get your key from Groq Console
          </a>
        </div>

        <div className="w-full flex gap-4">
          <button onClick={onPrev} className="flex-1 opacity-50 hover:opacity-100 transition-all font-semibold uppercase tracking-widest text-xs">BACK</button>
          <button 
            onClick={handleSaveGroq}
            disabled={!key}
            className={`btn-primary flex-[2] ${!key ? 'opacity-50 grayscale' : ''}`}
          >
            Save & Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="step-card glass-panel flex flex-col items-center animate-in slide-in-from-right-4 fade-in duration-500">
      <div className="w-16 h-16 rounded-full bg-orange-400/20 flex items-center justify-center mb-6">
        <Download className="w-8 h-8 text-orange-400" />
      </div>
      <h2 className="text-2xl font-bold mb-4 text-center tracking-tight">OLLAMA SETUP</h2>
      
      <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${ollamaStatus === 'ready' ? 'bg-green-500/20 text-green-400' : 'bg-white/10 text-white/40'}`}>
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="font-bold">Software Detection</p>
              <p className="text-xs text-white/40">{ollamaStatus === 'ready' ? 'Ollama binary detected' : 'Checking system...'}</p>
            </div>
          </div>
          <button onClick={checkOllama} className="p-2 hover:bg-white/10 rounded-lg transition-all">
            <RefreshCw size={18} className={ollamaStatus === 'checking' ? 'animate-spin' : ''} />
          </button>
        </div>

        {ollamaStatus === 'not_found' && (
          <div className="space-y-4 pt-4 border-t border-white/10 animate-in fade-in slide-in-from-top-2">
            <p className="text-sm text-center font-medium">Ollama is not installed on your system.</p>
            <button 
              onClick={() => window.open('https://ollama.com/download', '_blank')}
              className="w-full py-3 bg-white text-orange-600 font-bold rounded-xl flex items-center justify-center gap-2"
            >
              Download Ollama <ExternalLink size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="w-full flex gap-4">
        <button onClick={onPrev} className="flex-1 opacity-50 hover:opacity-100 transition-all font-semibold uppercase tracking-widest text-xs">BACK</button>
        <button 
          onClick={onNext}
          disabled={ollamaStatus !== 'ready'}
          className={`btn-primary flex-[2] ${ollamaStatus !== 'ready' ? 'opacity-50 grayscale' : ''}`}
        >
          {ollamaStatus === 'ready' ? 'Continue' : 'Waiting for Ollama...'}
        </button>
      </div>
    </div>
  );
};
