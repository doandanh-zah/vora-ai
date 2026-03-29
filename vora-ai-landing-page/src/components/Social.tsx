import { motion } from 'motion/react';
import { Twitter, Send, ArrowRight } from 'lucide-react';

export default function Social() {
  return (
    <section id="social" className="py-24 px-6 relative z-10 border-t border-white/5">
      <div className="max-w-3xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="inline-flex flex-col items-center"
        >
          <h2 className="text-3xl font-display font-bold mb-3">Join the Community</h2>
          <p className="text-gray-400 mb-10 max-w-md">Connect with other power users, share workflows, and get early access to new features.</p>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <a href="https://t.me/+gg0xVnSP1whmZTY1" target="_blank" rel="noreferrer" className="group flex items-center gap-3 text-white font-medium hover:text-cyan-300 transition-colors bg-cyan-500/20 px-8 py-4 rounded-full hover:bg-cyan-500/30 border border-cyan-500/30">
              <Send className="w-5 h-5 text-cyan-400" />
              Join Telegram Group
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform opacity-70" />
            </a>
            <a href="https://x.com/HeyVora_AI" target="_blank" rel="noreferrer" className="group flex items-center gap-3 text-white font-medium hover:text-blue-300 transition-colors bg-white/5 px-8 py-4 rounded-full hover:bg-white/10 border border-white/10">
              <Twitter className="w-5 h-5 text-blue-400" />
              Follow @HeyVora_AI
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
