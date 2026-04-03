import { motion, AnimatePresence } from 'motion/react';
import { X, Key, Settings2, Save, Cpu, ShieldAlert } from 'lucide-react';
import { useState, useEffect } from 'react';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  getConfig: () => Promise<any>;
  patchConfig: (patch: any) => Promise<any>;
  connected: boolean;
}

export function ConfigModal({ isOpen, onClose, getConfig, patchConfig, connected }: ConfigModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are Vora, a helpful AI assistant...');
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load config when opened
  useEffect(() => {
    if (isOpen && connected) {
      setIsLoading(true);
      getConfig().then((config) => {
        setApiKey(config?.models?.gemini?.apiKey || '');
        setSystemPrompt(config?.agents?.['main']?.systemPrompt || 'You are Vora, a helpful AI assistant...');
      }).catch(console.error).finally(() => setIsLoading(false));
    }
  }, [isOpen, connected, getConfig]);

  const handleSave = async () => {
    if (!connected) return;
    try {
      await patchConfig({
        models: {
          gemini: {
            apiKey: apiKey || null
          }
        },
        agents: {
          main: {
            systemPrompt: systemPrompt
          }
        }
      });
      setIsSaved(true);
      setTimeout(() => {
        setIsSaved(false);
        onClose();
      }, 1000);
    } catch (e) {
      console.error(e);
      // Could show an error state here
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-zinc-900/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl shadow-cyan-500/10 z-50 overflow-hidden"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-3 text-zinc-100 font-semibold">
                <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl">
                  <Settings2 size={20} />
                </div>
                Configuration
              </div>
              <button 
                onClick={onClose}
                className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* API Key Input */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                  <Key size={14} className="text-cyan-400" />
                  Gemini API Key
                </label>
                <input 
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                />
                <p className="text-xs text-zinc-500 flex items-center gap-1">
                  <ShieldAlert size={12} /> Stored locally in your browser.
                </p>
              </div>

              {/* System Prompt */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                  <Cpu size={14} className="text-purple-400" />
                  System Prompt
                </label>
                <textarea 
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="w-full h-24 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all resize-none"
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
                  isSaved 
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' 
                    : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40'
                }`}
              >
                {isSaved ? (
                  'Saved Successfully!'
                ) : (
                  <>
                    <Save size={18} />
                    Save Configuration
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
