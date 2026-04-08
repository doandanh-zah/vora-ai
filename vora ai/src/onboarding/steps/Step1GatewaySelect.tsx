import { useState } from 'react';
import { ArrowRight, Server, Globe } from 'lucide-react';

export const Step1GatewaySelect = ({ onNext, onPrev }: { onNext: (mode: string) => void; onPrev: () => void }) => {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="step-card glass-panel flex flex-col items-center animate-in slide-in-from-right-4 fade-in duration-500">
      <h2 className="text-2xl font-bold mb-8 text-center tracking-tight">
        GATEWAY MODE
      </h2>
      
      <div className="w-full flex flex-col gap-4">
        <label 
          className={`checkbox-item flex items-center justify-between group transition-all ${selected === 'local' ? 'selected' : ''}`}
          onClick={() => setSelected('local')}
        >
          <div className="flex items-center gap-4 text-left">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Server className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-lg">Local Gateway</p>
              <p className="text-white/40 text-xs uppercase tracking-wider italic">recommended for privacy</p>
            </div>
          </div>
          <div className="w-6 h-6 rounded-full border-2 border-white/20 flex items-center justify-center group-hover:border-white/50">
            {selected === 'local' && <div className="w-3 h-3 rounded-full bg-white animate-in zoom-in-50 duration-200" />}
          </div>
        </label>

        <label 
          className={`checkbox-item flex items-center justify-between group transition-all opacity-50 cursor-not-allowed`}
        >
          <div className="flex items-center gap-4 text-left">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Globe className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="font-semibold text-lg">Cloud Gateway</p>
              <p className="text-white/40 text-xs uppercase tracking-wider italic">coming soon</p>
            </div>
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
          Select Mode
          <ArrowRight size={18}/>
        </button>
      </div>
    </div>
  );
};
