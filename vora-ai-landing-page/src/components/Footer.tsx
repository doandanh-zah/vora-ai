import { useState } from 'react';
import { Mic } from 'lucide-react';
import Modal from './Modal';
import TermsContent from './TermsContent';
import PrivacyContent from './PrivacyContent';

export default function Footer() {
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);

  return (
    <>
      <footer className="py-12 px-6 border-t border-white/5 relative z-10 bg-black/20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-80">
            <Mic className="w-5 h-5 text-cyan-400" />
            <span className="font-display font-bold tracking-tight text-white">VORA</span>
          </div>
          
          <div className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} VORA AI Inc. All rights reserved.
          </div>
          
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <button onClick={() => setIsPrivacyOpen(true)} className="hover:text-white transition-colors">Privacy</button>
            <button onClick={() => setIsTermsOpen(true)} className="hover:text-white transition-colors">Terms</button>
            <a href="mailto:heyvora.ai@gmail.com" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>

      <Modal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} title="Terms of Service & Platform Policy">
        <TermsContent />
      </Modal>

      <Modal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} title="Privacy Policy">
        <PrivacyContent />
      </Modal>
    </>
  );
}
