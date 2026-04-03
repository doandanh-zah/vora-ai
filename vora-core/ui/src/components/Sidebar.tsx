import { MessageSquare, Plus, Settings, History, PanelLeftClose, LayoutDashboard, FileText, Wrench, BrainCircuit, Share2, Clock } from 'lucide-react';
import { motion } from 'motion/react';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onOpenConfig: () => void;
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
}

const NAV_ITEMS = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'skills', label: 'Skills', icon: BrainCircuit },
  { id: 'channels', label: 'Channels', icon: Share2 },
  { id: 'cron', label: 'Cron Jobs', icon: Clock },
];

export function Sidebar({ isOpen, setIsOpen, onOpenConfig, activeTab = 'chat', setActiveTab }: SidebarProps) {
  return (
    <motion.div
      initial={{ width: isOpen ? 280 : 0, opacity: isOpen ? 1 : 0 }}
      animate={{ width: isOpen ? 280 : 0, opacity: isOpen ? 1 : 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="h-full bg-zinc-950/80 border-r border-white/5 flex flex-col overflow-hidden shrink-0 backdrop-blur-3xl z-20 relative"
    >
      {/* Subtle animated background gradient for the sidebar */}
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />

      <div className="p-5 flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center gap-3 text-zinc-100 font-bold tracking-wider">
          <div className="relative w-8 h-8 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.3)] overflow-hidden group">
            <img src="/vora-logo.png" alt="Vora" className="w-full h-full object-cover relative z-10" />
          </div>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">VORA</span>
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <div className="px-4 pb-4 shrink-0 relative z-10">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 hover:from-cyan-500/20 hover:to-purple-500/20 text-cyan-50 rounded-xl transition-all duration-300 text-sm font-semibold border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)] hover:shadow-[0_0_25px_rgba(6,182,212,0.2)]"
        >
          <Plus size={18} className="text-cyan-400" />
          New Session
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6 relative z-10 custom-scrollbar">
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <motion.button 
                key={item.id}
                onClick={() => setActiveTab?.(item.id)}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium ${
                  isActive 
                    ? 'bg-white/10 text-white shadow-sm border border-white/5' 
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                }`}
              >
                <item.icon size={18} className={isActive ? 'text-cyan-400' : 'text-zinc-500'} />
                {item.label}
                {isActive && (
                  <motion.div 
                    layoutId="activeTabIndicator"
                    className="absolute left-0 w-1 h-6 bg-cyan-400 rounded-r-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        <div>
          <div className="text-xs font-bold text-zinc-500 mb-3 px-3 flex items-center gap-2 uppercase tracking-wider">
            <History size={14} />
            Recent
          </div>
          <div className="space-y-1">
            {['Analyze dashboard data', 'Write email to team', 'Debug React component'].map((item, i) => (
              <motion.button 
                whileHover={{ x: 4, backgroundColor: 'rgba(255,255,255,0.05)' }}
                key={i} 
                className="w-full text-left px-3 py-2.5 text-sm text-zinc-400 hover:text-zinc-100 rounded-xl transition-colors truncate font-medium"
              >
                {item}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-white/5 shrink-0 relative z-10 bg-zinc-950/50">
        <motion.button 
          whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.1)' }}
          whileTap={{ scale: 0.98 }}
          onClick={onOpenConfig}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-zinc-300 hover:text-white bg-white/5 rounded-xl transition-colors border border-white/5 group"
        >
          <Settings size={18} className="text-zinc-400 group-hover:text-cyan-400 transition-colors duration-300 group-hover:rotate-90" />
          Configuration
        </motion.button>
      </div>
    </motion.div>
  );
}
