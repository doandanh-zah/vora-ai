import { useState } from 'react';
import { ArrowRight, Box, Cpu } from 'lucide-react';

export const ProviderSelect = ({ onNext, onPrev }: { onNext: (provider: string) => void; onPrev: () => void }) => {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="step-card glass-panel flex flex-col items-center animate-in slide-in-from-right-4 fade-in duration-500">
      <h2 className="text-2xl font-bold mb-8 text-center tracking-tight">
        AI PROVIDER
      </h2>
      
      <div className="w-full flex flex-col gap-4">
        <label 
          className={`checkbox-item flex items-center justify-between group transition-all ${selected === 'ollama' ? 'selected' : ''}`}
          onClick={() => setSelected('ollama')}
        >
          <div className="flex items-center gap-4 text-left">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Box className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <p className="font-semibold text-lg">Ollama</p>
              <p className="text-white/40 text-xs uppercase tracking-wider italic">local gpu / cpu models</p>
            </div>
          </div>
          <div className="w-6 h-6 rounded-full border-2 border-white/20 flex items-center justify-center group-hover:border-white/50">
            {selected === 'ollama' && <div className="w-3 h-3 rounded-full bg-white animate-in zoom-in-50 duration-200" />}
          </div>
        </label>

        <label 
          className={`checkbox-item flex items-center justify-between group transition-all ${selected === 'groq' ? 'selected' : ''}`}
          onClick={() => setSelected('groq')}
        >
          <div className="flex items-center gap-4 text-left">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <Cpu className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <p className="font-semibold text-lg">Groq Cloud</p>
              <p className="text-white/40 text-xs uppercase tracking-wider italic">blazing fast inference</p>
            </div>
          </div>
          <div className="w-6 h-6 rounded-full border-2 border-white/20 flex items-center justify-center group-hover:border-white/50">
            {selected === 'groq' && <div className="w-3 h-3 rounded-full bg-white animate-in zoom-in-50 duration-200" />}
          </div>
        </label>
      </div>

      <div className="mt-12 w-full flex gap-4">
        <button onClick={onPrev} className="flex-1 opacity-50 hover:opacity-100 transition-all font-semibold uppercase tracking-widest text-xs">
          BACK
        </button>
        <button 
          onClick={() => selected && onNext(selected)}
          disabled={!selected}
          className={`btn-primary flex-[2] flex items-center justify-center gap-2 ${!selected ? 'opacity-50 grayscale' : ''}`}
        >
          Configure Provider
          <ArrowRight size={18}/>
        </button>
      </div>
    </div>
  );
};
