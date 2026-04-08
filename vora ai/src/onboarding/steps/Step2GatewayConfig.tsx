import { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export const Step2GatewayConfig = ({ onNext, onPrev, onSetPort, onInstallService, onStartService }: { 
  onNext: () => void; 
  onPrev: () => void;
  onSetPort: (port: number) => Promise<void>;
  onInstallService: () => Promise<void>;
  onStartService: () => Promise<void>;
}) => {
  const [port, setPort] = useState(27106);
  const [status, setStatus] = useState<'idle' | 'installing' | 'starting' | 'ready'>('idle');

  const handleSetup = async () => {
    setStatus('installing');
    await onSetPort(port);
    await onInstallService();
    setStatus('starting');
    await onStartService();
    setStatus('ready');
  };

  return (
    <div className="step-card glass-panel flex flex-col items-center animate-in slide-in-from-right-4 fade-in duration-500">
      <h2 className="text-2xl font-bold mb-8 text-center tracking-tight uppercase tracking-widest text-[#0076FF]">
        GATEWAY CONFIG
      </h2>
      
      <div className="w-full space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-white/50 uppercase tracking-widest pl-1">Gateway Port</label>
          <input 
            type="number" 
            value={port}
            onChange={(e) => setPort(parseInt(e.target.value))}
            className="form-input text-2xl font-bold tracking-widest"
          />
        </div>

        <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Service Installation</span>
            {status === 'installing' ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : status === 'starting' || status === 'ready' ? (
              <CheckCircle2 size={18} className="text-green-400" />
            ) : null}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Service Status</span>
            {status === 'starting' ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            ) : status === 'ready' ? (
              <CheckCircle2 size={18} className="text-green-400" />
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-12 w-full flex flex-col gap-4">
        {status === 'idle' ? (
          <button 
            onClick={handleSetup}
            className="btn-primary w-full py-4 text-lg"
          >
            Install & Start Services
          </button>
        ) : status === 'ready' ? (
          <button 
            onClick={onNext}
            className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2"
          >
            Continue to Models
            <ArrowRight size={20} />
          </button>
        ) : (
          <div className="w-full py-4 text-center text-white/50 animate-pulse italic">
            Setting up your Gateway...
          </div>
        )}
        
        <button onClick={onPrev} className="opacity-30 hover:opacity-100 transition-all font-semibold uppercase tracking-widest text-xs mt-2">
          RECONFIGURE
        </button>
      </div>
    </div>
  );
};
