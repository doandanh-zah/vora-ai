/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ActionPanel } from './components/ActionPanel';
import { ChatArea } from './components/ChatArea';
import { InputArea } from './components/InputArea';
import { ConfigModal } from './components/ConfigModal';
import { PanelLeft, Activity, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGateway } from './hooks/useGateway';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isActionPanelOpen, setIsActionPanelOpen] = useState(true);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const { connected, helloState, error, events, sendChat, getConfig, patchConfig } = useGateway();

  const [messages, setMessages] = useState<{id: string, role: 'user' | 'assistant', content: string}[]>([
    { id: '1', role: 'assistant', content: 'Hello! I am connected to the Vora local instance.' }
  ]);

  const handleSend = async (text: string) => {
    const newMessage = { id: Date.now().toString(), role: 'user' as const, content: text };
    setMessages((prev) => [...prev, newMessage]);
    try {
      await sendChat(text);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'assistant' as const, content: 'Error: Could not send message to Vora.'}]);
    }
  };

  useEffect(() => {
    if (events.length > 0) {
      const lastEvent = events[events.length - 1];
      if (lastEvent.event === 'chat.message') {
        const payload = lastEvent.payload as any;
        if (payload?.message?.role === 'assistant') {
          setMessages((prev) => {
            // Basic deduplication
            if (prev.find(m => m.id === payload.message.id)) return prev;
            return [...prev, {
              id: payload.message.id || Date.now().toString(),
              role: 'assistant',
              content: payload.message.content || ''
            }];
          });
        }
      }
    }
  }, [events]);

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans relative">
      {/* Ambient Background Glow */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-cyan-600/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none" />

      <Sidebar 
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
        onOpenConfig={() => setIsConfigOpen(true)} 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
      
      <main className="flex-1 flex flex-col relative min-w-0 z-10">
        {/* Top Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 shrink-0 bg-zinc-950/50 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              >
                <PanelLeft size={20} />
              </motion.button>
            )}
            <div className="flex flex-col">
              <span className="font-semibold text-zinc-100 tracking-tight capitalize">{activeTab} Session</span>
              <span className={`text-xs font-medium ${connected ? 'text-cyan-400' : 'text-rose-400'}`}>
                {connected ? 'Vora Gateway Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          
          {!isActionPanelOpen && (
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsActionPanelOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-full transition-colors shadow-[0_0_15px_rgba(6,182,212,0.15)]"
            >
              <Activity size={16} />
              View Actions
            </motion.button>
          )}
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'chat' ? (
            <motion.div 
              key="chat"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <ChatArea messages={messages} />
              <div className="bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent pt-10 pb-6 px-4 shrink-0">
                <InputArea onSend={handleSend} />
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="other"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex-1 flex items-center justify-center p-8"
            >
              <div className="flex flex-col items-center justify-center text-zinc-500 max-w-md text-center">
                <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-2xl">
                  <Sparkles size={32} className="text-cyan-500/50" />
                </div>
                <h2 className="text-2xl font-semibold text-zinc-200 mb-2 capitalize">{activeTab} View</h2>
                <p className="text-sm leading-relaxed">
                  The {activeTab} view is currently under construction. This area will display specialized controls and information for this feature.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <ActionPanel isOpen={isActionPanelOpen} setIsOpen={setIsActionPanelOpen} />
      
      <ConfigModal 
        isOpen={isConfigOpen} 
        onClose={() => setIsConfigOpen(false)} 
        getConfig={getConfig}
        patchConfig={patchConfig}
        connected={connected}
      />
    </div>
  );
}
