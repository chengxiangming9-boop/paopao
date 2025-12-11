import React, { useState, useEffect } from 'react';
import MicroverseCanvas from './components/MicroverseCanvas';
import { AppMode, BubbleTheme } from './types';
import { THEME_COLORS } from './constants';

const MODES: AppMode[] = [
  { id: 'MEDITATION', name: 'Meditation Garden', description: 'Slow, gentle gravity. Soft sounds.' },
  { id: 'LAB', name: 'Science Lab', description: 'Data visualization. Physics focus.' },
  { id: 'ARTIST', name: 'Artist Studio', description: 'Creative colors. Paint with bubbles.' },
];

function App() {
  const [activeMode, setActiveMode] = useState<AppMode['id']>('MEDITATION');
  const [expansionTheme, setExpansionTheme] = useState<BubbleTheme | null>(null);

  // Handle the "Universe Expansion" visual effect when a bubble pops
  const handleExpandUniverse = (theme: BubbleTheme) => {
    setExpansionTheme(theme);
    // Auto-reset after animation
    setTimeout(() => {
        setExpansionTheme(null);
    }, 600);
  };

  return (
    <div className="w-full h-screen overflow-hidden bg-black font-sans text-white select-none">
      
      {/* 3D/Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <MicroverseCanvas mode={activeMode} onExpandUniverse={handleExpandUniverse} />
      </div>

      {/* Universe Expansion Flash Overlay */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none transition-opacity duration-500 ease-out"
        style={{
            opacity: expansionTheme ? 0.3 : 0,
            backgroundColor: expansionTheme ? `hsl(${THEME_COLORS[expansionTheme].main})` : 'transparent',
            mixBlendMode: 'screen'
        }}
      />
      {expansionTheme && (
         <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none animate-pulse">
            <h1 className="text-6xl font-thin tracking-[0.5em] uppercase text-white opacity-50 blur-sm scale-150 transition-transform duration-500">
                {expansionTheme}
            </h1>
         </div>
      )}

      {/* UI Overlay */}
      <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-6">
        
        {/* Header */}
        <header className="flex justify-between items-start">
          <div className="pointer-events-auto">
            <h1 className="text-3xl font-light tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-blue-100 to-purple-200 opacity-90">
              MICROVERSE
            </h1>
            <p className="text-xs text-blue-300/60 mt-1 uppercase tracking-widest">Tactile Visualization System</p>
          </div>
          
          <div className="pointer-events-auto flex gap-2">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setActiveMode(mode.id)}
                className={`px-4 py-2 text-xs uppercase tracking-widest border transition-all duration-300 backdrop-blur-md
                  ${activeMode === mode.id 
                    ? 'border-white/80 bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
                    : 'border-white/10 text-white/40 hover:border-white/40 hover:text-white/80'
                  } rounded-full`}
              >
                {mode.name}
              </button>
            ))}
          </div>
        </header>

        {/* Footer Instructions */}
        <footer className="text-center opacity-0 hover:opacity-100 transition-opacity duration-500 delay-1000">
             <div className="inline-block px-6 py-3 bg-black/40 backdrop-blur-lg rounded-2xl border border-white/5">
                <div className="flex items-center gap-6 text-sm text-gray-300">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">👉</span>
                        <span>Use <b className="text-white">TWO FINGERS</b> (Index+Middle) to Aim</span>
                    </div>
                    <div className="w-px h-4 bg-white/20"></div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                        <span><b className="text-white">POKE</b> to Pop</span>
                    </div>
                </div>
             </div>
        </footer>
      </div>

    </div>
  );
}

export default App;