import { Mic, Paperclip, Send, Square, X, File as FileIcon, Image as ImageIcon } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export function InputArea({ onSend }: { onSend?: (text: string) => void }) {
  const [isListening, setIsListening] = useState(false);
  const [text, setText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<{name: string, type: string}[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [text]);

  const handleAttach = () => {
    // Mock attaching a file
    setAttachedFiles([...attachedFiles, { name: `document-${attachedFiles.length + 1}.pdf`, type: 'pdf' }]);
  };

  const removeFile = (index: number) => {
    setAttachedFiles(attachedFiles.filter((_, i) => i !== index));
  };

  return (
    <div className="p-4 shrink-0 max-w-4xl mx-auto w-full">
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative flex flex-col gap-2 bg-zinc-900/60 border border-white/10 rounded-[2rem] p-2 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] focus-within:border-cyan-500/50 focus-within:shadow-[0_0_30px_rgba(6,182,212,0.15)] transition-all duration-300"
      >
        
        {/* Attached Files Preview */}
        <AnimatePresence>
          {attachedFiles.length > 0 && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex flex-wrap gap-2 px-3 pt-2 pb-1"
            >
              {attachedFiles.map((file, i) => (
                <motion.div 
                  key={i}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="flex items-center gap-2 bg-zinc-800/80 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-zinc-300 shadow-sm"
                >
                  {file.type === 'image' ? <ImageIcon size={14} className="text-purple-400" /> : <FileIcon size={14} className="text-cyan-400" />}
                  <span className="max-w-[100px] truncate">{file.name}</span>
                  <button 
                    onClick={() => removeFile(i)}
                    className="ml-1 p-0.5 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X size={12} />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2 w-full">
          <button 
            onClick={handleAttach}
            className="p-3.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors shrink-0"
          >
            <Paperclip size={20} />
          </button>

          <textarea 
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask Vora to do something..."
            className="w-full min-h-[48px] bg-transparent border-none focus:ring-0 resize-none text-zinc-100 placeholder:text-zinc-500 py-3.5 px-2 text-base font-medium custom-scrollbar"
            rows={1}
          />

          <AnimatePresence mode="wait">
            {text.trim().length > 0 || attachedFiles.length > 0 ? (
              <motion.button 
                key="send"
                onClick={() => {
                  if (text.trim() && onSend) {
                    onSend(text);
                    setText('');
                  }
                }}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="p-3.5 bg-gradient-to-r from-cyan-500 to-purple-500 text-white rounded-full shadow-lg shadow-cyan-500/25 shrink-0 mb-0.5 mr-0.5"
              >
                <Send size={18} className="ml-0.5" />
              </motion.button>
            ) : (
              <motion.button 
                key="mic"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsListening(!isListening)}
                className={`p-3.5 rounded-full transition-all shrink-0 mb-0.5 mr-0.5 relative ${
                  isListening 
                    ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]' 
                    : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                }`}
              >
                {isListening ? (
                  <>
                    <Square size={18} className="fill-current" />
                    <motion.div 
                      animate={{ scale: [1, 2], opacity: [0.8, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }}
                      className="absolute inset-0 rounded-full border-2 border-red-500"
                    />
                    <motion.div 
                      animate={{ scale: [1, 2.5], opacity: [0.5, 0] }}
                      transition={{ repeat: Infinity, duration: 1.5, delay: 0.4, ease: "easeOut" }}
                      className="absolute inset-0 rounded-full border border-red-500"
                    />
                  </>
                ) : (
                  <Mic size={18} />
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      <div className="text-center mt-4 text-xs font-medium text-zinc-500 tracking-wide">
        Vora can make mistakes. Consider verifying important actions.
      </div>
    </div>
  );
}
