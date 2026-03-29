/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import Background from './components/Background';
import Header from './components/Header';
import Hero from './components/Hero';
import Features from './components/Features';
import Download from './components/Download';
import Requirements from './components/Requirements';
import Social from './components/Social';
import FinalCTA from './components/FinalCTA';
import Footer from './components/Footer';
import Modal from './components/Modal';

export default function App() {
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);

  return (
    <div className="min-h-screen text-white selection:bg-cyan-500/30">
      <Background />
      <Header />
      <main>
        <Hero onDownloadClick={() => setIsReleaseModalOpen(true)} />
        <Features />
        <Download onDownloadClick={() => setIsReleaseModalOpen(true)} />
        <Requirements />
        <Social />
        <FinalCTA />
      </main>
      <Footer />

      <Modal
        isOpen={isReleaseModalOpen}
        onClose={() => setIsReleaseModalOpen(false)}
        title="VORA 1.0 is coming soon"
      >
        <div className="space-y-4 text-gray-300 leading-relaxed">
          <p>
            VORA 1.0 has not been released yet.
          </p>
          <p>
            Please join our Telegram group and follow us on X <strong className="text-white">@HeyVora_AI</strong> to get launch updates.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <a
              href="https://t.me/+gg0xVnSP1whmZTY1"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-full bg-cyan-500/20 border border-cyan-500/40 hover:bg-cyan-500/30 transition-colors text-center"
            >
              Join Telegram
            </a>
            <a
              href="https://x.com/HeyVora_AI"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-full bg-white/5 border border-white/20 hover:bg-white/10 transition-colors text-center"
            >
              Follow on X
            </a>
          </div>
        </div>
      </Modal>
    </div>
  );
}
