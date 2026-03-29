/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Background from './components/Background';
import Header from './components/Header';
import Hero from './components/Hero';
import Features from './components/Features';
import Download from './components/Download';
import Requirements from './components/Requirements';
import Social from './components/Social';
import FinalCTA from './components/FinalCTA';
import Footer from './components/Footer';

export default function App() {
  return (
    <div className="min-h-screen text-white selection:bg-cyan-500/30">
      <Background />
      <Header />
      <main>
        <Hero />
        <Features />
        <Download />
        <Requirements />
        <Social />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
