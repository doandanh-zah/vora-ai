import { useState, useEffect } from 'react';
import { motion } from 'motion/react';

export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'glass py-4' : 'bg-transparent py-6'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/vora-logo.png"
            alt="VORA logo"
            className="w-8 h-8 object-contain"
          />
          <span className="font-display font-bold text-xl tracking-tight">VORA</span>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#download" className="hover:text-white transition-colors">Download</a>
          <a href="#requirements" className="hover:text-white transition-colors">Requirements</a>
          <a href="#social" className="hover:text-white transition-colors">Social</a>
        </nav>

        <a href="#download" className="hidden md:block px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium transition-all hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(34,211,238,0.2)]">
          Get VORA
        </a>
      </div>
    </motion.header>
  );
}
