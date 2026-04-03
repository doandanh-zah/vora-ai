import { Bot, User, Sparkles, Code, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'text' | 'code';
}

const MOCK_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'user',
    content: 'Can you help me click the submit button on this form?',
  },
  {
    id: '2',
    role: 'assistant',
    content: 'I can see the form on your screen. I am locating the "Submit" button now. I will click it for you.',
  },
  {
    id: '3',
    role: 'user',
    content: 'Also, can you write a quick python script to scrape the data?',
  },
  {
    id: '4',
    role: 'assistant',
    content: 'import requests\nfrom bs4 import BeautifulSoup\n\nurl = "https://example.com"\nresponse = requests.get(url)\nsoup = BeautifulSoup(response.text, "html.parser")\n\nfor item in soup.find_all("div", class_="data-item"):\n    print(item.text)',
    type: 'code'
  }
];

export function ChatArea({ messages }: { messages: Message[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth z-10 custom-scrollbar">
      <div className="max-w-3xl mx-auto space-y-8 pb-10">
        {messages.length === 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center h-full text-zinc-500 mt-20"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full" />
              <Sparkles size={48} className="mb-4 text-cyan-400 relative z-10" />
            </div>
            <p className="text-lg font-medium text-zinc-300">How can Vora help you today?</p>
            <p className="text-sm text-zinc-500 mt-2">Try asking me to perform an action or write some code.</p>
          </motion.div>
        )}

        {messages.map((msg, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.1, type: 'spring', stiffness: 200, damping: 20 }}
            key={msg.id} 
            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-lg relative group ${
              msg.role === 'assistant' 
                ? 'bg-gradient-to-br from-cyan-500/20 to-purple-500/20 text-cyan-300 border border-cyan-500/30 shadow-cyan-500/10' 
                : 'bg-white/10 text-zinc-300 border border-white/5 backdrop-blur-md'
            }`}>
              {msg.role === 'assistant' ? <Bot size={20} /> : <User size={20} />}
              {msg.role === 'assistant' && (
                <div className="absolute inset-0 bg-cyan-400/20 rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              )}
            </div>
            
            <div className={`flex flex-col gap-1.5 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className="text-[10px] font-bold tracking-widest text-zinc-500 px-1 uppercase">
                {msg.role === 'assistant' ? 'Vora Agent' : 'You'}
              </div>
              
              {msg.type === 'code' ? (
                <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#0d0d0d] w-full">
                  <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
                    <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
                      <Code size={14} />
                      python
                    </div>
                    <button 
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {copiedId === msg.id ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <pre className="p-4 overflow-x-auto text-sm font-mono text-zinc-300 leading-relaxed">
                    <code>{msg.content}</code>
                  </pre>
                </div>
              ) : (
                <div className={`px-5 py-3.5 rounded-3xl text-sm leading-relaxed shadow-xl relative overflow-hidden ${
                  msg.role === 'user' 
                    ? 'bg-gradient-to-br from-zinc-800 to-zinc-900 text-zinc-100 rounded-tr-sm border border-white/5' 
                    : 'bg-zinc-900/80 backdrop-blur-md text-zinc-200 border border-white/10 rounded-tl-sm'
                }`}>
                  {msg.role === 'assistant' && (
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-50" />
                  )}
                  {msg.content}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        <AnimatePresence>
          {isTyping && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex gap-4"
            >
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 text-cyan-300 border border-cyan-500/30">
                <Bot size={20} />
              </div>
              <div className="flex flex-col gap-1.5 items-start justify-center">
                <div className="text-[10px] font-bold tracking-widest text-zinc-500 px-1 uppercase">
                  Vora Agent
                </div>
                <div className="px-5 py-4 rounded-3xl bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-tl-sm flex items-center gap-1.5 shadow-xl">
                  <motion.div 
                    animate={{ y: [0, -5, 0] }} 
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0 }}
                    className="w-1.5 h-1.5 bg-cyan-400 rounded-full" 
                  />
                  <motion.div 
                    animate={{ y: [0, -5, 0] }} 
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }}
                    className="w-1.5 h-1.5 bg-cyan-400 rounded-full" 
                  />
                  <motion.div 
                    animate={{ y: [0, -5, 0] }} 
                    transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }}
                    className="w-1.5 h-1.5 bg-cyan-400 rounded-full" 
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
