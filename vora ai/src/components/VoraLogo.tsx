import React from 'react';

export const VoraLogo: React.FC<{ size?: number; hideText?: boolean }> = ({ size = 120, hideText = false }) => {
  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        width={size}
        height={size * 0.8}
        viewBox="0 0 120 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-lg"
      >
        {/* Main V Shape - Thick and rounded */}
        <path
          d="M25 20L55 85L85 20"
          stroke="white"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Signal/Sound segments on the right arm */}
        <path
          d="M98 35C104 42 104 58 98 65"
          stroke="white"
          strokeWidth="6"
          strokeLinecap="round"
          className="animate-pulse"
        />
        <path
          d="M110 25C120 38 120 62 110 75"
          stroke="white"
          strokeWidth="6"
          strokeLinecap="round"
          className="animate-pulse"
          style={{ animationDelay: '0.2s' }}
        />

        {/* Interior Sound Waves (Equalizer) */}
        <rect x="44" y="45" width="4" height="15" rx="2" fill="white" className="animate-bounce" style={{ animationDuration: '0.8s' }} />
        <rect x="53" y="35" width="4" height="30" rx="2" fill="white" className="animate-bounce" style={{ animationDuration: '0.6s' }} />
        <rect x="62" y="40" width="4" height="22" rx="2" fill="white" className="animate-bounce" style={{ animationDuration: '0.7s' }} />
        <rect x="71" y="48" width="4" height="10" rx="2" fill="white" className="animate-bounce" style={{ animationDuration: '0.9s' }} />
      </svg>
      {!hideText && <h1 className="text-4xl font-bold tracking-[0.2em] text-white mt-4 drop-shadow-md">VORA</h1>}
    </div>
  );
};
