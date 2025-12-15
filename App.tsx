
import React, { useState, useEffect } from 'react';
import MicroverseCanvas from './components/MicroverseCanvas';
import { AppMode, BubbleTheme, VisualMode } from './types';
import { THEME_COLORS } from './constants';

const MODES: AppMode[] = [
  { id: VisualMode.HOLO, name: 'HOLOGRAPHIC', description: 'Deep Space. Neon Light.' },
  { id: VisualMode.INK, name: 'ZEN INK', description: 'Paper & Brush. Calligraphy.' },
  { id: VisualMode.RETRO, name: 'CYBER GRID', description: 'Retro Synthwave. Wireframe.' },
];

function App() {
  const [activeMode, setActiveMode] = useState<VisualMode>(VisualMode.HOLO);
  const [expansionTheme, setExpansionTheme] = useState<BubbleTheme | null>(null);

  // Handle the "Universe Expansion" visual effect when a bubble pops
  const handleExpandUniverse = (theme: BubbleTheme) => {
    setExpansionTheme(theme);
    // Auto-reset after animation
    setTimeout(() => {
        setExpansionTheme(null);
    }, 600);
  };

  const getButtonStyle = (modeId: VisualMode, isActive: boolean) => {
      if (modeId === VisualMode.HOLO) {
          return isActive 
            ? 'border-cyan-400 bg-cyan-900/30 text-cyan-100 shadow-[0_0_15px_rgba(0,255,255,0.4)]' 
            : 'border-white/10 text-white/40 hover:text-cyan-200';
      }
      if (modeId === VisualMode.INK) {
          return isActive 
            ? 'border-neutral-800 bg-white text-black font-serif shadow-lg' 
            : 'border-white/10 text-white/40 hover:text-white hover:bg-white/10';
      }
      if (modeId === VisualMode.RETRO) {
          return isActive 
            ? 'border-pink-500 bg-purple-900/40 text-pink-200 shadow-[0_0_15px_rgba(255,0,255,0.4)] italic' 
            : 'border-white/10 text-white/40 hover:text-pink-200';
      }
      return '';
  };

  return (
    <div className={`w-full h-screen overflow-hidden font-sans select-none transition-colors duration-700
        ${activeMode === VisualMode.INK ? 'bg-[#F2F0E6] text-black' : 'bg-black text-white'}
    `}>
      
      {/* 3D/Canvas Layer */}
      <div className="absolute inset-0 z-0">
        <MicroverseCanvas mode={activeMode} onExpandUniverse={handleExpandUniverse} />
      </div>

      {/* Universe Expansion Flash Overlay - Adjusted for modes */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none transition-all duration-700 ease-out backdrop-blur-sm"
        style={{
            opacity: expansionTheme ? 0.12 : 0, 
            backgroundColor: expansionTheme ? `hsl(${THEME_COLORS[expansionTheme].main})` : 'transparent',
            mixBlendMode: activeMode === VisualMode.INK ? 'multiply' : 'screen'
        }}
      />

      {/* UI Overlay */}
      <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-6">
        
        {/* Header */}
        <header className="flex justify-between items-start">
          <div className="pointer-events-auto">
            <h1 className={`text-4xl font-extralight tracking-[0.2em] transition-all duration-500
                ${activeMode === VisualMode.INK ? 'text-black drop-shadow-none font-serif tracking-[0.1em] font-bold' : 'bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-white opacity-90 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]'}
                ${activeMode === VisualMode.RETRO ? 'text-pink-500 italic drop-shadow-[2px_2px_0px_#00FFFF]' : ''}
            `}>
              {activeMode === VisualMode.INK ? '水墨微尘' : (activeMode === VisualMode.RETRO ? 'CYBERVERSE' : '空无之涟')}
            </h1>
            <p className={`text-[10px] mt-2 uppercase tracking-[0.4em] ml-1 opacity-60
                ${activeMode === VisualMode.INK ? 'text-neutral-600 font-serif' : 'text-blue-200'}
            `}>Ripples of Nothingness</p>
          </div>
          
          <div className="pointer-events-auto flex gap-3">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setActiveMode(mode.id)}
                className={`px-4 py-2 text-xs uppercase tracking-widest border transition-all duration-300 rounded-sm ${getButtonStyle(mode.id, activeMode === mode.id)}`}
              >
                {mode.name}
              </button>
            ))}
          </div>
        </header>

        {/* Description Text based on mode */}
        <div className={`absolute top-20 right-6 text-right text-xs tracking-wider opacity-70 transition-colors duration-500
             ${activeMode === VisualMode.INK ? 'text-neutral-500' : 'text-white/50'}
        `}>
            {MODES.find(m => m.id === activeMode)?.description}
        </div>

        {/* Instructions Sidebar */}
        <div className="absolute right-6 top-32 w-64 pointer-events-auto space-y-4">
             <div className={`backdrop-blur-md border rounded-xl p-4 text-sm space-y-3 transition-colors duration-500
                ${activeMode === VisualMode.INK ? 'bg-white/40 border-black/10 text-neutral-800' : 'bg-black/20 border-white/10 text-white'}
             `}>
                <h3 className={`uppercase tracking-widest text-xs font-bold border-b pb-2
                    ${activeMode === VisualMode.INK ? 'text-neutral-900 border-black/10' : 'text-blue-300 border-white/10'}
                `}>交互手势</h3>
                
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg
                        ${activeMode === VisualMode.INK ? 'bg-black/5' : 'bg-white/5'}
                    `}>🤏</div>
                    <div>
                        <p className="font-bold opacity-90">捏合 (Pinch)</p>
                        <p className="text-xs opacity-50">吹出新泡泡</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg
                         ${activeMode === VisualMode.INK ? 'bg-black/5' : 'bg-white/5'}
                    `}>☝️</div>
                    <div>
                        <p className="font-bold opacity-90">单指 (Point)</p>
                        <p className="text-xs opacity-50">戳: 随机特效 / 划: 连破</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg
                         ${activeMode === VisualMode.INK ? 'bg-black/5' : 'bg-white/5'}
                    `}>✋</div>
                    <div>
                        <p className="font-bold opacity-90">张手 (Open Hand)</p>
                        <p className="text-xs opacity-50">移动带出一串泡泡</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg
                         ${activeMode === VisualMode.INK ? 'bg-black/5' : 'bg-white/5'}
                    `}>✊</div>
                    <div>
                        <p className="font-bold opacity-90">握拳 (Fist)</p>
                        <p className="text-xs opacity-50">强力反弹泡泡</p>
                    </div>
                </div>
             </div>
        </div>

      </div>

    </div>
  );
}

export default App;
