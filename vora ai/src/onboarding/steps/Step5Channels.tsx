import { useState } from 'react';
import { Send, Hash, ArrowRight } from 'lucide-react';

export const Step5Channels = ({ onNext, onPrev }: { onNext: (data: any) => void; onPrev: () => void }) => {
  const [telegramToken, setTelegramToken] = useState('');
  const [discordToken, setDiscordToken] = useState('');

  return (
    <div className="step-card glass-panel flex flex-col items-center animate-in slide-in-from-right-4 fade-in duration-500">
      <h2 className="text-2xl font-bold mb-8 text-center tracking-tight">COMMUNICATION CHANNELS</h2>
      
      <div className="w-full space-y-6 mb-10">
        <div className="space-y-4 p-5 rounded-2xl bg-blue-500/5 border border-blue-500/10">
           <div className="flex items-center gap-3">
             <Send className="text-blue-400" size={20} />
             <span className="font-bold text-sm tracking-widest text-blue-400">TELEGRAM BOT (OPTIONAL)</span>
           </div>
           <input 
            type="password" 
            placeholder="Bot Token..."
            value={telegramToken}
            onChange={(e) => setTelegramToken(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="space-y-4 p-5 rounded-2xl bg-indigo-500/5 border border-indigo-500/10">
           <div className="flex items-center gap-3">
             <Hash className="text-indigo-400" size={20} />
             <span className="font-bold text-sm tracking-widest text-indigo-400">DISCORD BOT (OPTIONAL)</span>
           </div>
           <input 
            type="password" 
            placeholder="Bot Token..."
            value={discordToken}
            onChange={(e) => setDiscordToken(e.target.value)}
            className="form-input"
          />
        </div>
      </div>

      <div className="w-full flex gap-4">
        <button onClick={onPrev} className="flex-1 opacity-50 hover:opacity-100 transition-all font-semibold uppercase tracking-widest text-xs">BACK</button>
        <button 
          onClick={() => onNext({ telegramToken, discordToken })}
          className="btn-primary flex-[2] flex items-center justify-center gap-2"
        >
          {telegramToken || discordToken ? 'Save & Continue' : 'Skip & Continue'}
          <ArrowRight size={18}/>
        </button>
      </div>
    </div>
  );
};
