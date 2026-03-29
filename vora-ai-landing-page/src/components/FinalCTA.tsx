import { motion } from 'motion/react';

export default function FinalCTA() {
  return (
    <section className="py-24 px-6 relative z-10 border-t border-white/5">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col items-center"
        >
          <h2 className="text-4xl md:text-6xl font-display font-bold mb-6">
            Experience the <span className="text-gradient">future</span> of interaction
          </h2>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl">
            Download VORA now and transform how you work, create, and communicate.
          </p>
          
          <a href="#download" className="group relative inline-flex items-center justify-center gap-3 px-10 py-5 rounded-full bg-white text-black font-semibold text-lg transition-all hover:scale-105 hover:shadow-[0_0_40px_rgba(34,211,238,0.5)] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-cyan-400/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative z-10">Get VORA for Free</span>
          </a>
        </motion.div>
      </div>
    </section>
  );
}
