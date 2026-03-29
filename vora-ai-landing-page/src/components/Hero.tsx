import { motion } from 'motion/react';
import { Apple, Monitor } from 'lucide-react';

interface HeroProps {
  onDownloadClick: () => void;
}

export default function Hero({ onDownloadClick }: HeroProps) {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-24 pb-12 px-6 overflow-hidden">
      <div className="max-w-5xl mx-auto text-center z-10 w-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass mb-8 text-xs font-medium text-cyan-400 border-cyan-500/30"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          VORA 1.0 will release soon
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-6xl md:text-8xl lg:text-9xl font-display font-bold tracking-tighter mb-6 leading-[1.1]"
        >
          Turn your voice <br className="hidden md:block" />
          <span className="text-gradient">into action</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-12 font-light"
        >
          VORA is the first voice-native AI agent for your desktop. It sees what you see, hears what you say, and executes complex workflows across your apps instantly.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button
            onClick={onDownloadClick}
            className="group relative w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-white text-black font-medium text-sm transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(34,211,238,0.4)] overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-400/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Apple className="w-5 h-5 relative z-10" />
            <span className="relative z-10">Download for Mac</span>
          </button>
          <button
            onClick={onDownloadClick}
            className="group w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-full glass hover:bg-white/5 border border-white/10 font-medium text-sm transition-all hover:scale-105 hover:border-cyan-500/50 hover:shadow-[0_0_20px_rgba(34,211,238,0.15)]"
          >
            <Monitor className="w-5 h-5 text-gray-300 group-hover:text-cyan-400 transition-colors" />
            <span>Download for Windows</span>
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-24 relative h-32 w-full flex items-center justify-center gap-1 sm:gap-1.5 opacity-90 overflow-hidden"
        >
          {[...Array(70)].map((_, i) => (
            <motion.div
              key={i}
              animate={{
                height: [
                  Math.random() * 20 + 10,
                  Math.random() * 100 + 20,
                  Math.random() * 20 + 10
                ]
              }}
              transition={{
                duration: Math.random() * 1.5 + 1,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: Math.random() * 2
              }}
              className="w-1 sm:w-2 rounded-full bg-gradient-to-t from-blue-500 to-cyan-300"
              style={{ opacity: 1 - Math.abs(i - 35) / 40 }}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent z-10" />
        </motion.div>
      </div>
    </section>
  );
}
