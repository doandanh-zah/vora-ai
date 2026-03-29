import { motion } from 'motion/react';
import { Apple, Monitor, Download as DownloadIcon } from 'lucide-react';

export default function Download() {
  return (
    <section id="download" className="py-24 px-6 relative z-10">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="glass rounded-3xl p-8 md:p-16 relative overflow-hidden border border-cyan-500/20"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[80px] rounded-full" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-500/10 blur-[80px] rounded-full" />

          <div className="relative z-10 flex flex-col items-center text-center">
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-6">Ready to upgrade your workflow?</h2>
            <p className="text-gray-400 mb-12 max-w-xl">
              Download VORA today and experience the most advanced voice assistant built for professionals.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
              <button className="group flex flex-col items-center justify-center gap-4 p-8 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:border-cyan-500/50 hover:shadow-[0_0_30px_rgba(34,211,238,0.15)]">
                <Apple className="w-10 h-10 text-white" />
                <div>
                  <div className="font-semibold text-lg">MacBook Silicon</div>
                  <div className="text-xs text-gray-400 mt-1">Optimized for M1/M2/M3</div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                  <DownloadIcon className="w-4 h-4" /> Download .dmg
                </div>
              </button>

              <button className="group flex flex-col items-center justify-center gap-4 p-8 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:border-blue-500/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]">
                <Monitor className="w-10 h-10 text-white" />
                <div>
                  <div className="font-semibold text-lg">Windows 11</div>
                  <div className="text-xs text-gray-400 mt-1">x64 Architecture</div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0">
                  <DownloadIcon className="w-4 h-4" /> Download .exe
                </div>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
