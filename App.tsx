
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
        className="absolute inset-0 z-10 pointer-events-none transition-all duration-700 ease-out backdrop-blur-sm"
        style={{
            opacity: expansionTheme ? 0.12 : 0, // Reduced opacity for fainter imprint
            backgroundColor: expansionTheme ? `hsl(${THEME_COLORS[expansionTheme].main})` : 'transparent',
            mixBlendMode: 'screen'
        }}
      />
      {expansionTheme && (
         <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none animate-pulse">
            <h1 className="text-6xl font-thin tracking-[0.5em] uppercase text-white opacity-40 blur-sm scale-150 transition-transform duration-500">
                {expansionTheme}
            </h1>
         </div>
      )}

      {/* UI Overlay */}
      <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-6">
        
        {/* Header */}
        <header className="flex justify-between items-start">
          <div className="pointer-events-auto">
            <h1 className="text-4xl font-extralight tracking-[0.2em] bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-white opacity-90 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
              空无之涟
            </h1>
            <p className="text-[10px] text-blue-200/50 mt-2 uppercase tracking-[0.4em] ml-1">Ripples of Nothingness</p>
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

        {/* Instructions Sidebar */}
        <div className="absolute right-6 top-28 w-64 pointer-events-auto space-y-4">
             <div className="bg-black/20 backdrop-blur-md border border-white/10 rounded-xl p-4 text-sm space-y-3">
                <h3 className="text-blue-300 uppercase tracking-widest text-xs font-bold border-b border-white/10 pb-2">交互手势</h3>
                
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-lg">🤏</div>
                    <div>
                        <p className="font-bold text-white/90">捏合 (Pinch)</p>
                        <p className="text-xs text-white/50">吹出新泡泡</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-lg">☝️</div>
                    <div>
                        <p className="font-bold text-white/90">单指 (Point)</p>
                        <p className="text-xs text-white/50">戳: 随机特效 (结冰/融化)</p>
                        <p className="text-xs text-white/50">划: 快速连破</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-lg">✋</div>
                    <div>
                        <p className="font-bold text-white/90">张手 (Open Hand)</p>
                        <p className="text-xs text-white/50">移动带出一串泡泡</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-lg">✊</div>
                    <div>
                        <p className="font-bold text-white/90">握拳 (Fist)</p>
                        <p className="text-xs text-white/50">强力反弹泡泡</p>
                    </div>
                </div>
             </div>
        </div>

      </div>

    </div>
  );
}

export default App;
