import { Terminal, Activity, ChevronRight, X, Cpu, Database, Network } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ActionPanelProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const logs = [
  { time: '10:42:01.102', type: 'info', message: 'Initializing Vora Agent Core v2.4.1...' },
  { time: '10:42:01.450', type: 'system', message: 'Connected to Gateway [wss://api.vora.ai]' },
  { time: '10:42:02.015', type: 'action', message: 'Capturing screen context via Accessibility API' },
  { time: '10:42:03.112', type: 'success', message: 'Screen context analyzed (1920x1080, 24 elements)' },
  { time: '10:42:05.881', type: 'action', message: 'Locating element matching "Submit Button"' },
  { time: '10:42:06.204', type: 'info', message: 'Found element <button id="submit-btn"> at (x: 450, y: 820)' },
  { time: '10:42:07.001', type: 'action', message: 'Executing native click event' },
  { time: '10:42:07.150', type: 'success', message: 'Action completed successfully' },
];

export function ActionPanel({ isOpen, setIsOpen }: ActionPanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 380, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="h-full bg-[#0a0a0a] border-l border-white/5 flex flex-col overflow-hidden shrink-0 z-20 relative"
        >
          {/* Terminal Grid Background */}
          <div 
            className="absolute inset-0 pointer-events-none opacity-[0.03]" 
            style={{ 
              backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', 
              backgroundSize: '20px 20px' 
            }} 
          />

          <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-black/40 backdrop-blur-md relative z-10">
            <div className="flex items-center gap-2 text-zinc-100 text-xs font-bold tracking-widest uppercase">
              <Activity size={14} className="text-cyan-400" />
              Action Transparency
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 text-zinc-500 hover:text-white hover:bg-white/10 rounded transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Status Bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-white/[0.02] border-b border-white/5 text-[10px] font-mono text-zinc-500 uppercase tracking-wider relative z-10">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><Cpu size={10} /> CPU: 12%</span>
              <span className="flex items-center gap-1"><Database size={10} /> MEM: 1.2GB</span>
            </div>
            <span className="flex items-center gap-1 text-emerald-500/70"><Network size={10} /> 24ms</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-3 relative z-10 custom-scrollbar">
            {logs.map((log, i) => (
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, type: 'spring', stiffness: 200 }}
                key={i} 
                className="flex gap-3 group"
              >
                <span className="text-zinc-600 shrink-0 select-none">{log.time}</span>
                <div className="flex gap-2">
                  <ChevronRight size={12} className={`shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5 ${
                    log.type === 'action' ? 'text-cyan-400' : 
                    log.type === 'success' ? 'text-emerald-400' : 
                    log.type === 'system' ? 'text-purple-400' :
                    'text-zinc-500'
                  }`} />
                  <span className={`leading-relaxed ${
                    log.type === 'action' ? 'text-cyan-100' : 
                    log.type === 'success' ? 'text-emerald-100' : 
                    log.type === 'system' ? 'text-purple-200' :
                    'text-zinc-400'
                  }`}>
                    {log.message}
                  </span>
                </div>
              </motion.div>
            ))}
            
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: logs.length * 0.05 + 0.5 }}
              className="flex items-center gap-2 text-zinc-600 mt-6 pt-4 border-t border-white/5"
            >
              <Terminal size={12} className="animate-pulse text-cyan-500/50" />
              <span className="animate-pulse">Waiting for next action...</span>
              <motion.div 
                animate={{ opacity: [1, 0] }} 
                transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                className="w-1.5 h-3 bg-cyan-500/50 ml-1"
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
