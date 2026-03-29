import { motion } from 'motion/react';
import { useEffect, useState } from 'react';

export default function Background() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [particles, setParticles] = useState<{ id: number; left: number; top: number; duration: number; delay: number }[]>([]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    
    // Generate particles only on client to avoid hydration mismatch if SSR was used
    const generatedParticles = Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      duration: Math.random() * 10 + 10,
      delay: Math.random() * 5,
    }));
    setParticles(generatedParticles);

    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden bg-[#050505]">
      <motion.div 
        animate={{ 
          x: mousePosition.x * -30,
          y: mousePosition.y * -30,
        }}
        transition={{ type: "spring", stiffness: 50, damping: 20 }}
        className="absolute inset-0"
      >
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/15 blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-cyan-400/10 blur-[150px] mix-blend-screen animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
        <div className="absolute top-[30%] left-[50%] w-[40%] h-[40%] rounded-full bg-sky-300/10 blur-[120px] mix-blend-screen animate-pulse" style={{ animationDuration: '12s', animationDelay: '4s' }} />
      </motion.div>
      
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute w-1 h-1 bg-cyan-400 rounded-full blur-[1px]"
          style={{ left: `${p.left}%`, top: `${p.top}%` }}
          initial={{ opacity: Math.random() * 0.5 + 0.1 }}
          animate={{
            y: [0, -150],
            opacity: [Math.random() * 0.5 + 0.1, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
      
      {/* Subtle noise overlay to prevent banding */}
      <div className="absolute inset-0 opacity-[0.015] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
    </div>
  );
}
