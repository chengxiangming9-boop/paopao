import React, { useEffect, useRef } from 'react';
import { getHandLandmarker, initializeVision } from '../services/vision';
import { Bubble, BubbleTheme, BubbleElement, BubbleState, HandData, Particle, Vector2, GestureType, VisualMode } from '../types';
import { 
    GRAVITY, 
    AIR_RESISTANCE, 
    BUBBLE_SPAWN_RATE,
    MAX_BUBBLES, 
    THEME_COLORS,
    THUMB_TIP, INDEX_TIP, INDEX_MCP, MIDDLE_TIP, RING_TIP, PINKY_TIP, MIDDLE_MCP, RING_MCP, PINKY_MCP,
    WRIST
} from '../constants';

interface MicroverseCanvasProps {
  mode: VisualMode;
  onExpandUniverse: (theme: BubbleTheme) => void;
}

interface ExtendedParticle extends Particle {
    type: 'LIQUID' | 'SHARD' | 'MIST' | 'SPARK' | 'RING' | 'FLASH';
    rotation: number;
    rotationSpeed: number;
    stretch: number; // For liquid viscosity
    onGround: boolean; // Physics state
    maxLife: number;
    element?: BubbleElement;
}

// History buffer size for gesture stabilization. 
const GESTURE_HISTORY_SIZE = 4;

const determineGesture = (hand: HandData, width: number, height: number): GestureType => {
    const { landmarks } = hand;
    const wrist = landmarks[WRIST];

    // Helper: Is finger extended? (Tip further from wrist than MCP)
    const isExtended = (tipIdx: number, mcpIdx: number) => {
        const tip = landmarks[tipIdx];
        const mcp = landmarks[mcpIdx];
        const dTip = (tip.x - wrist.x) ** 2 + (tip.y - wrist.y) ** 2;
        const dMcp = (mcp.x - wrist.x) ** 2 + (mcp.y - wrist.y) ** 2;
        return dTip > dMcp; 
    };

    const indexOpen = isExtended(INDEX_TIP, INDEX_MCP);
    const middleOpen = isExtended(MIDDLE_TIP, MIDDLE_MCP);
    const ringOpen = isExtended(RING_TIP, RING_MCP);
    const pinkyOpen = isExtended(PINKY_TIP, PINKY_MCP);

    const thumbTip = landmarks[THUMB_TIP];
    const indexTip = landmarks[INDEX_TIP];
    
    // Pinch: Index and Thumb tips are close
    const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const PINCH_THRESHOLD = 0.05; 

    if (pinchDist < PINCH_THRESHOLD) {
        return GestureType.PINCH;
    }

    if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen) return GestureType.FIST;
    if (indexOpen && middleOpen && ringOpen && pinkyOpen) return GestureType.OPEN_HAND;
    if (indexOpen && !ringOpen && !pinkyOpen) return GestureType.POINT;

    return GestureType.NONE;
};

const MicroverseCanvas: React.FC<MicroverseCanvasProps> = ({ mode, onExpandUniverse }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(0);
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastVideoTime = useRef<number>(-1);

  // Simulation State
  const bubbles = useRef<Bubble[]>([]);
  const particles = useRef<ExtendedParticle[]>([]);
  const frameCount = useRef<number>(0);
  const spawnTimer = useRef<number>(0);
  const handResults = useRef<HandData[]>([]);
  
  // Mouse Interaction State
  const mouseRef = useRef({
      x: -1000,
      y: -1000,
      vx: 0,
      vy: 0,
      isDown: false,
      isRightDown: false, // Track right mouse button
      startX: 0,
      startY: 0,
      isDragging: false,
      downTime: 0
  });
  const mouseTrailRef = useRef<{x: number, y: number} | null>(null);
  
  // Advanced Smoothing & State Persistence
  const prevHandData = useRef<Map<number, { 
      landmarks: Vector2[], 
      center: Vector2, 
      velocity: Vector2,
      gestureHistory: GestureType[],
      lastTrailPos?: Vector2
  }>>(new Map());
  
  // Interaction Logic
  const activeBubbleCreation = useRef<{ x: number, y: number, radius: number, timer: number } | null>(null);
  const lockedTarget = useRef<{ id: string, x: number, y: number, r: number } | null>(null);

  // --- INIT NOISE TEXTURE FOR INK MODE ---
  useEffect(() => {
    const nc = document.createElement('canvas');
    nc.width = 256;
    nc.height = 256;
    const nCtx = nc.getContext('2d');
    if (nCtx) {
        const iData = nCtx.createImageData(256, 256);
        for(let i=0; i<iData.data.length; i+=4) {
            const v = Math.random() * 50; 
            iData.data[i] = v;
            iData.data[i+1] = v;
            iData.data[i+2] = v;
            iData.data[i+3] = 40; // Alpha
        }
        nCtx.putImageData(iData, 0, 0);
        noiseCanvasRef.current = nc;
    }
  }, []);

  // Helpers
  const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;
  const dist = (p1: Vector2, p2: Vector2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
  const dist3D = (p1: {x:number, y:number, z:number}, p2: {x:number, y:number, z:number}) => {
      return Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
  };
  
  const noise = (x: number, y: number, t: number) => {
      return Math.sin(x * 4.0 + t) * Math.cos(y * 3.5 + t * 0.5) * 0.5 + 
             Math.sin(x * 12.0 - t * 1.5) * 0.25;
  };

  const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

  const getElementBehavior = (theme: BubbleTheme): BubbleElement => {
      switch (theme) {
          case BubbleTheme.CRYSTAL:
          case BubbleTheme.QUANTUM:
          case BubbleTheme.CYBER:
              return BubbleElement.ICE; 
          case BubbleTheme.NEBULA:
          case BubbleTheme.ABSTRACT:
              return BubbleElement.FIRE; 
          default:
              return BubbleElement.WATER; 
      }
  };

  const createBubble = (x: number, y: number, r: number | null = null, vx: number = 0, vy: number = 0, isTrail: boolean = false): Bubble[] => {
    const themes = Object.values(BubbleTheme);
    const theme = themes[Math.floor(Math.random() * themes.length)];
    
    const isLarge = r ? r > 50 : Math.random() > 0.85; 
    const radius = r || (isLarge ? randomRange(80, 110) : randomRange(40, 70));
    
    const element = getElementBehavior(theme);

    const mainBubble: Bubble = {
      id: Math.random().toString(36).substr(2, 9),
      x,
      y,
      radius,
      vx: vx !== 0 ? vx : 0,
      vy: vy !== 0 ? vy : randomRange(-0.5, -1.2), 
      theme,
      element,
      hue: parseInt(THEME_COLORS[theme].main.split(',')[0]),
      phase: Math.random() * Math.PI * 2,
      wobble: 0,
      state: BubbleState.FLOATING,
      stateTimer: 0, 
      contentSeed: Math.random(),
      mass: radius * radius,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: randomRange(-0.02, 0.02),
      creationTime: Date.now(),
      isTrail // Set the trail flag
    };

    const newBubbles = [mainBubble];

    if (isLarge && Math.random() > 0.4) {
        const count = Math.floor(randomRange(1, 3));
        for(let i=0; i<count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const smallR = randomRange(15, 30);
            const d = radius + smallR * 0.6; 
            newBubbles.push({
                ...mainBubble,
                id: Math.random().toString(36).substr(2, 9),
                x: x + Math.cos(angle) * d,
                y: y + Math.sin(angle) * d,
                radius: smallR,
                vx: mainBubble.vx + randomRange(-0.1, 0.1), 
                vy: mainBubble.vy + randomRange(-0.1, 0.1),
                mass: smallR * smallR,
                contentSeed: Math.random(),
                creationTime: Date.now(),
                isTrail // Inherit trail status
            });
        }
    }

    return newBubbles;
  };

  const createParticles = (b: Bubble, type: 'SHATTER' | 'MELT' | 'EVAPORATE' | 'POPPING') => {
    // Standard effects adapted per mode in draw loop
    const count = type === 'POPPING' ? 40 : 20;
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = randomRange(2, 12);
        
        let pType: ExtendedParticle['type'] = 'MIST';
        let life = 1.0;
        let vy = Math.sin(angle) * speed;
        let vx = Math.cos(angle) * speed;
        let size = randomRange(2, 6);
        let color = `hsl(${b.hue}, 100%, 90%)`; 
        
        if (type === 'POPPING') {
            pType = 'SPARK';
            life = randomRange(0.4, 0.8);
        }

        particles.current.push({
            id: Math.random().toString(),
            x: b.x + Math.cos(angle) * b.radius * 0.5,
            y: b.y + Math.sin(angle) * b.radius * 0.5,
            vx, vy, life, color, size, type: pType,
            rotation: Math.random() * Math.PI,
            rotationSpeed: randomRange(-0.2, 0.2),
            stretch: 1,
            element: b.element,
            onGround: false,
            maxLife: life
        } as ExtendedParticle);
    }
  };

  // --- DRAWING FUNCTIONS ---

  const drawHandSkeleton = (ctx: CanvasRenderingContext2D, hand: HandData) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const connections = [
        [0,1,2,3,4], [0,5,6,7,8], [0,9,10,11,12], [0,13,14,15,16], [0,17,18,19,20],
        [5,9,13,17], [0,5], [0,17] 
    ];

    if (mode === VisualMode.INK) {
        // --- INK MODE: Calligraphy Brush ---
        ctx.strokeStyle = 'rgba(20, 20, 20, 0.85)';
        
        connections.forEach(chain => {
            // Draw multiple thin lines to simulate brush bristles
            const bristleCount = 3;
            for (let b = 0; b < bristleCount; b++) {
                ctx.beginPath();
                const offset = (b - 1) * 1.5;
                for(let i = 0; i < chain.length - 1; i++) {
                    const p1 = hand.landmarks[chain[i]];
                    const p2 = hand.landmarks[chain[i+1]];
                    
                    // Dynamic width based on finger index (tapering)
                    ctx.lineWidth = Math.max(1, (6 - i) * 0.8); 
                    
                    const x1 = p1.x * ctx.canvas.width + offset;
                    const y1 = p1.y * ctx.canvas.height + offset;
                    const x2 = p2.x * ctx.canvas.width + offset;
                    const y2 = p2.y * ctx.canvas.height + offset;
                    
                    if(i===0) ctx.moveTo(x1, y1);
                    else ctx.lineTo(x1, y1);
                    ctx.lineTo(x2, y2);
                }
                ctx.globalAlpha = 0.6 - (b * 0.1); // Fade outer bristles
                ctx.stroke();
            }
        });

        // Red Seal (Hanko) for joints
        hand.landmarks.forEach((lm, index) => {
            if (index % 4 === 0) { // Only main joints
                const r = index === 0 ? 8 : 4; 
                ctx.fillStyle = '#B22222'; // Firebrick red
                ctx.globalAlpha = 0.8;
                ctx.beginPath();
                // Imperfect circle (seal impression)
                ctx.arc(lm.x * ctx.canvas.width, lm.y * ctx.canvas.height, r, 0, Math.PI * 2);
                ctx.fill();
            }
        });

    } else if (mode === VisualMode.RETRO) {
        // --- RETRO MODE: Data Glove / Tron Style ---
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00FF00';
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00FF00'; // Terminal Green
        
        // Digital glitches
        const glitch = Math.random() > 0.95;
        if (glitch) {
            ctx.shadowColor = '#FF00FF';
            ctx.strokeStyle = '#FF00FF';
            ctx.translate(randomRange(-5, 5), 0);
        }

        connections.forEach(chain => {
            ctx.beginPath();
            for(let i = 0; i < chain.length - 1; i++) {
                const p1 = hand.landmarks[chain[i]];
                const p2 = hand.landmarks[chain[i+1]];
                const x1 = p1.x * ctx.canvas.width;
                const y1 = p1.y * ctx.canvas.height;
                const x2 = p2.x * ctx.canvas.width;
                const y2 = p2.y * ctx.canvas.height;
                
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
            }
            ctx.stroke();
        });

        // Draw Nodes (Joints)
        ctx.fillStyle = '#000000';
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        hand.landmarks.forEach((lm, index) => {
            const x = lm.x * ctx.canvas.width;
            const y = lm.y * ctx.canvas.height;
            const r = 4;
            ctx.beginPath();
            ctx.rect(x - r, y - r, r*2, r*2); // Square joints
            ctx.fill();
            ctx.stroke();
        });
        
    } else {
        // --- HOLO MODE (DEFAULT) ---
        const FLUORESCENT_BLUE = '#00FFFF'; 
        const BRIGHT_CORE = '#F0FFFF'; 

        ctx.globalCompositeOperation = 'source-over'; 
        ctx.shadowBlur = 15;
        ctx.shadowColor = FLUORESCENT_BLUE;
        ctx.strokeStyle = FLUORESCENT_BLUE;
        ctx.lineWidth = 2; 

        connections.forEach(chain => {
            ctx.beginPath();
            for(let i = 0; i < chain.length - 1; i++) {
                const p1 = hand.landmarks[chain[i]];
                const p2 = hand.landmarks[chain[i+1]];
                ctx.moveTo(p1.x * ctx.canvas.width, p1.y * ctx.canvas.height);
                ctx.lineTo(p2.x * ctx.canvas.width, p2.y * ctx.canvas.height);
            }
            ctx.stroke();
        });

        ctx.fillStyle = BRIGHT_CORE;
        ctx.shadowBlur = 20; 
        ctx.shadowColor = FLUORESCENT_BLUE;
        
        hand.landmarks.forEach((lm, index) => {
            ctx.beginPath();
            const r = (index === 0) ? 7 : 5; 
            ctx.arc(lm.x * ctx.canvas.width, lm.y * ctx.canvas.height, r, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    ctx.restore();
  };

  const drawBubble = (ctx: CanvasRenderingContext2D, b: Bubble) => {
    ctx.save();
    ctx.translate(b.x, b.y);

    const time = frameCount.current * 0.02;

    if (mode === VisualMode.INK) {
        // --- INK MODE: Enso (Zen Circle) ---
        // Imperfect circle with "bleed"
        
        const deform = (angle: number) => {
             // Noise-based radius deformation
             return noise(Math.cos(angle), Math.sin(angle), b.id.charCodeAt(0) + time * 0.2);
        };

        // 1. Inner Wash (The water)
        ctx.beginPath();
        for (let i = 0; i <= 30; i++) {
            const theta = (i / 30) * Math.PI * 2;
            const r = b.radius * (0.8 + deform(theta) * 0.1);
            const x = Math.cos(theta) * r;
            const y = Math.sin(theta) * r;
            if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
        ctx.fill();

        // 2. The Stroke (Dark Ink)
        // Draw multiple overlapping loops to create "brush" texture
        ctx.globalCompositeOperation = 'source-over';
        
        for (let loop = 0; loop < 2; loop++) {
            ctx.beginPath();
            const segments = 40;
            // Gap in the circle (Enso characteristic)
            const gapStart = b.contentSeed * Math.PI * 2;
            const gapSize = 0.4; // Radians
            
            for (let i = 0; i <= segments; i++) {
                const pct = i / segments;
                const theta = gapStart + pct * (Math.PI * 2 - gapSize);
                
                // Variation per loop
                const rVar = deform(theta + loop) * 0.2;
                const r = b.radius * (0.95 + rVar);
                const x = Math.cos(theta) * r;
                const y = Math.sin(theta) * r;
                
                if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
            }
            
            ctx.strokeStyle = `rgba(10, 10, 10, ${0.5 - loop * 0.2})`;
            ctx.lineWidth = 3 + Math.sin(loop * 10) * 1.5;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

    } else if (mode === VisualMode.RETRO) {
        // --- RETRO MODE: Rotating Wireframe Sphere ---
        const rotX = time + b.rotation;
        const rotY = b.contentSeed * 10 + time * 0.5;

        ctx.strokeStyle = `hsl(${b.hue}, 100%, 60%)`;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 5;
        ctx.shadowColor = `hsl(${b.hue}, 100%, 50%)`;

        // Draw Sphere Outline
        ctx.beginPath();
        ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; // Occlude background lines
        ctx.fill();
        ctx.stroke();

        // Draw Wireframe (Latitudes/Longitudes)
        ctx.beginPath();
        
        // 3D Projection Helper
        const project = (px: number, py: number, pz: number) => {
             // Simple rotation matrix application
             // Rotate around Y
             let x = px * Math.cos(rotY) - pz * Math.sin(rotY);
             let z = px * Math.sin(rotY) + pz * Math.cos(rotY);
             // Rotate around X
             let y = py * Math.cos(rotX) - z * Math.sin(rotX);
             // z = py * Math.sin(rotX) + z * Math.cos(rotX);
             return { x, y };
        };

        const steps = 8;
        // Longitudes
        for (let i = 0; i < steps; i++) {
             const phi = (i / steps) * Math.PI;
             for (let j = 0; j <= 20; j++) {
                 const theta = (j / 20) * Math.PI * 2;
                 const px = b.radius * Math.sin(phi) * Math.cos(theta);
                 const py = b.radius * Math.cos(phi);
                 const pz = b.radius * Math.sin(phi) * Math.sin(theta);
                 const p = project(px, py, pz);
                 if (j===0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
             }
        }
        // Latitudes (simpler for performance: just ellipses)
        for (let i = 1; i < 4; i++) {
             const rRing = b.radius * Math.sin((i/4) * Math.PI);
             const yRing = b.radius * Math.cos((i/4) * Math.PI);
             // Draw projected ring
             for (let j = 0; j <= 20; j++) {
                 const theta = (j/20) * Math.PI * 2;
                 const px = rRing * Math.cos(theta);
                 const pz = rRing * Math.sin(theta);
                 const p = project(px, yRing, pz);
                 if (j===0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
             }
        }
        ctx.stroke();

    } else {
        // --- HOLO MODE (DEFAULT) ---
        // (Keeping original high-quality code)
        ctx.globalAlpha = 1.0;
        
        // Shape
        ctx.beginPath();
        const segments = 40; 
        const wobbleFactor = b.state === BubbleState.FROZEN ? 0 : 0.8;
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const n1 = noise(Math.cos(theta), Math.sin(theta), time + b.rotation) * 0.03;
            const n2 = noise(Math.cos(theta) * 2, Math.sin(theta) * 2, -time * 0.5) * 0.01;
            const r = b.radius * (1 + (n1 + n2) * wobbleFactor);
            const x = Math.cos(theta) * r;
            const y = Math.sin(theta) * r;
            if (i===0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fill();
        
        ctx.save();
        ctx.clip();
        const rimGrad = ctx.createRadialGradient(0,0, b.radius * 0.4, 0,0, b.radius);
        rimGrad.addColorStop(0, 'rgba(0,0,0,0)');
        rimGrad.addColorStop(0.7, `hsla(${b.hue}, 80%, 50%, 0.1)`);
        rimGrad.addColorStop(0.92, `hsla(${b.hue}, 90%, 60%, 0.6)`); 
        rimGrad.addColorStop(1, `hsla(${b.hue}, 100%, 80%, 0.8)`); 
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = rimGrad;
        ctx.fill();
        
        // Oil slick
        ctx.globalCompositeOperation = 'overlay'; 
        ctx.save();
        ctx.rotate(time * 0.2 + b.rotation); 
        ctx.scale(1.5, 1.5); 
        const oilGrad = ctx.createLinearGradient(-b.radius, -b.radius, b.radius, b.radius);
        oilGrad.addColorStop(0, `hsla(${b.hue - 40}, 100%, 50%, 0.5)`);
        oilGrad.addColorStop(1, `hsla(${b.hue}, 100%, 40%, 0.5)`);
        ctx.fillStyle = oilGrad;
        ctx.fill();
        ctx.restore();
        ctx.restore(); 

        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = `hsla(${b.hue}, 100%, 90%, 0.4)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Highlight
        ctx.globalCompositeOperation = 'lighter';
        ctx.save();
        ctx.translate(-b.radius * 0.4, -b.radius * 0.45);
        ctx.rotate(-Math.PI / 4);
        ctx.beginPath();
        ctx.ellipse(0, 0, b.radius * 0.25, b.radius * 0.15, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fill();
        ctx.restore();
    }

    if (lockedTarget.current && lockedTarget.current.id === b.id) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = mode === VisualMode.INK ? '#FF0000' : 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, b.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
  };

  const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
      if (mode === VisualMode.INK) {
          // --- INK MODE: Organic Rice Paper ---
          ctx.fillStyle = '#F4F1EA'; // Warm rice paper
          ctx.fillRect(0, 0, width, height);
          
          // Apply pre-generated noise texture
          if (noiseCanvasRef.current) {
              ctx.save();
              ctx.globalCompositeOperation = 'multiply';
              ctx.globalAlpha = 0.08; 
              const pat = ctx.createPattern(noiseCanvasRef.current, 'repeat');
              if (pat) {
                  ctx.fillStyle = pat;
                  ctx.fillRect(0,0,width,height);
              }
              ctx.restore();
          }

      } else if (mode === VisualMode.RETRO) {
          // --- RETRO MODE: Moving Perspective Grid ---
          
          // Sky (Gradient)
          const grad = ctx.createLinearGradient(0,0,0,height);
          grad.addColorStop(0, '#0D0221'); // Deep Purple
          grad.addColorStop(0.4, '#240046'); 
          grad.addColorStop(0.4, '#000000'); // Horizon Line cut
          grad.addColorStop(1, '#1a0033'); // Floor
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, width, height);

          // The Grid
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(200, 0, 255, 0.5)';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#FF00FF';

          const horizonY = height * 0.4;
          const centerX = width / 2;
          
          // Clip to bottom half
          ctx.rect(0, horizonY, width, height - horizonY);
          ctx.clip();

          // Vertical Lines (Perspective fan)
          for (let x = -width; x < width * 2; x += 100) {
              ctx.moveTo(centerX, horizonY); // All lines start at vanishing point
              // Slope calculation
              const slope = (x - centerX) * 4; 
              ctx.lineTo(centerX + slope, height);
          }

          // Horizontal Lines (Moving forward)
          const speed = (time * 200) % 100; // Movement loop
          // Exponential spacing for depth illusion
          for (let i = 0; i < 20; i++) {
              const yOffset = (i * 40 + speed) % 800;
              // Map linear offset to exponential Y coord
              const y = height - (800 / (yOffset + 100)) * (height - horizonY);
              
              if (y > horizonY) {
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
              }
          }
          
          ctx.stroke();
          
          // Horizon Glow
          ctx.beginPath();
          ctx.moveTo(0, horizonY);
          ctx.lineTo(width, horizonY);
          ctx.strokeStyle = '#00FFFF';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#00FFFF';
          ctx.shadowBlur = 20;
          ctx.stroke();

          ctx.restore();
          
      } else {
          // --- HOLO MODE: Deep Space Void ---
          ctx.fillStyle = '#050505'; 
          ctx.fillRect(0, 0, width, height);
      }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    mouseRef.current.isDown = true;
    if (e.button === 2) mouseRef.current.isRightDown = true;
    mouseRef.current.startX = x;
    mouseRef.current.startY = y;
    mouseRef.current.x = x;
    mouseRef.current.y = y;
    mouseRef.current.downTime = Date.now();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    mouseRef.current.vx = x - mouseRef.current.x;
    mouseRef.current.vy = y - mouseRef.current.y;
    mouseRef.current.x = x;
    mouseRef.current.y = y;
    
    if (mouseRef.current.isDown) {
        const d = Math.hypot(x - mouseRef.current.startX, y - mouseRef.current.startY);
        if (d > 5) mouseRef.current.isDragging = true;
    }
  };

  const handleMouseUp = () => {
    mouseRef.current.isDown = false;
    mouseRef.current.isRightDown = false;
    mouseRef.current.isDragging = false;
  };

  const handleMouseLeave = () => {
    mouseRef.current.isDown = false;
    mouseRef.current.isRightDown = false;
    mouseRef.current.isDragging = false;
    mouseRef.current.x = -1000;
    mouseRef.current.y = -1000;
  };

  const update = (time: number) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    
    const now = Date.now();

    drawBackground(ctx, width, height, time * 0.001);

    // ... (Hand Tracking Logic remains unchanged, keeping shared physics)
    // Only rendering logic changed above.
    
    // <INSERT_HAND_TRACKING_LOGIC>
    // Copying hand tracking logic to ensure functionality persists
    
    const handLandmarker = getHandLandmarker();
    if (handLandmarker && videoRef.current && videoRef.current.readyState >= 2) {
       if (videoRef.current.currentTime !== lastVideoTime.current) {
           lastVideoTime.current = videoRef.current.currentTime;
           const detections = handLandmarker.detectForVideo(videoRef.current, performance.now());
           
           handResults.current = detections.landmarks.map((landmarks, i) => {
             const currentRawLandmarks = landmarks.map(lm => ({ x: 1 - lm.x, y: lm.y }));
             const rawCenter = { x: currentRawLandmarks[9].x * width, y: currentRawLandmarks[9].y * height };
             const prev = prevHandData.current.get(i);
             let smoothedLandmarks: Vector2[] = [];
             let smoothedCenter = rawCenter;
             let smoothedVelocity = {x:0, y:0};
             let gestureHistory: GestureType[] = prev ? prev.gestureHistory : [];
             let lastTrailPos = prev?.lastTrailPos || rawCenter;

             if (prev) {
                 const distMoved = Math.hypot(rawCenter.x - prev.center.x, rawCenter.y - prev.center.y);
                 const alpha = Math.min(0.7, Math.max(0.15, distMoved * 0.015));
                 smoothedLandmarks = currentRawLandmarks.map((curr, idx) => {
                     const prevLm = prev.landmarks[idx];
                     return { x: lerp(prevLm.x, curr.x, alpha), y: lerp(prevLm.y, curr.y, alpha) };
                 });
                 smoothedCenter = { x: smoothedLandmarks[9].x * width, y: smoothedLandmarks[9].y * height };
                 smoothedVelocity = { x: smoothedCenter.x - prev.center.x, y: smoothedCenter.y - prev.center.y };
             } else {
                 smoothedLandmarks = currentRawLandmarks;
                 smoothedCenter = rawCenter;
             }
    
             const tempHand: HandData = {
                 landmarks: smoothedLandmarks,
                 worldLandmarks: detections.worldLandmarks[i],
                 handedness: detections.handedness[i][0].categoryName as 'Left' | 'Right',
                 gesture: GestureType.NONE,
                 pinchStrength: 0,
                 center: smoothedCenter,
                 velocity: smoothedVelocity
             };
    
             const rawGesture = determineGesture(tempHand, width, height);
             gestureHistory.push(rawGesture);
             if (gestureHistory.length > GESTURE_HISTORY_SIZE) gestureHistory.shift();
    
             const counts: Record<string, number> = {};
             gestureHistory.forEach(g => { counts[g] = (counts[g] || 0) + 1; });
             let stableGesture = rawGesture;
             let maxCount = 0;
             Object.entries(counts).forEach(([g, count]) => {
                 if (count > maxCount) { maxCount = count; stableGesture = g as GestureType; }
             });
    
             prevHandData.current.set(i, { 
                 landmarks: smoothedLandmarks, 
                 center: smoothedCenter, 
                 velocity: smoothedVelocity,
                 gestureHistory,
                 lastTrailPos
             });
             return { ...tempHand, gesture: stableGesture };
           });
       }
    }
    // </INSERT_HAND_TRACKING_LOGIC>

    lockedTarget.current = null;
    let closestDistToFinger = 9999;

    handResults.current.forEach((hand, index) => {
        drawHandSkeleton(ctx, hand);
        
        const indexTip = { x: hand.landmarks[INDEX_TIP].x * width, y: hand.landmarks[INDEX_TIP].y * height };

        if (hand.gesture === GestureType.PINCH) {
            if (!activeBubbleCreation.current) {
                activeBubbleCreation.current = { x: indexTip.x, y: indexTip.y, radius: 15, timer: 0 };
            } else {
                activeBubbleCreation.current.x = activeBubbleCreation.current.x * 0.8 + indexTip.x * 0.2;
                activeBubbleCreation.current.y = activeBubbleCreation.current.y * 0.8 + indexTip.y * 0.2;
                activeBubbleCreation.current.radius += 1.0; 
                activeBubbleCreation.current.timer++;
            }
        } 

        if (hand.gesture === GestureType.OPEN_HAND) {
            const prevData = prevHandData.current.get(index);
            if (prevData && prevData.lastTrailPos) {
                 const distMoved = dist(hand.center, prevData.lastTrailPos);
                 const spawnStep = 15; 
                 if (distMoved > spawnStep) {
                     const count = Math.min(Math.floor(distMoved / spawnStep), 5); 
                     for (let s = 1; s <= count; s++) {
                         if (bubbles.current.length >= MAX_BUBBLES + 10) break; 
                         const t = s / count;
                         const tx = lerp(prevData.lastTrailPos.x, hand.center.x, t);
                         const ty = lerp(prevData.lastTrailPos.y, hand.center.y, t);
                         const r = randomRange(15, 25); 
                         const turbulenceX = (Math.random() - 0.5) * 1.5;
                         const turbulenceY = (Math.random() - 0.5) * 1.5;
                         const trailBubble = createBubble(tx, ty, r, hand.velocity.x * 0.15 + turbulenceX, hand.velocity.y * 0.15 + turbulenceY, true);
                         bubbles.current.push(...trailBubble);
                     }
                     prevData.lastTrailPos = hand.center;
                     prevHandData.current.set(index, prevData);
                 }
            }
        } else {
            const prevData = prevHandData.current.get(index);
            if (prevData) {
                prevData.lastTrailPos = hand.center;
                prevHandData.current.set(index, prevData);
            }
        }

        if (hand.gesture === GestureType.FIST) {
            bubbles.current.forEach(b => {
                const dx = b.x - hand.center.x;
                const dy = b.y - hand.center.y;
                const dist = Math.hypot(dx, dy);
                const repelRange = 120 + b.radius;
                if (dist < repelRange && dist > 0) {
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const force = Math.pow((1 - dist / repelRange), 2) * 8.0; 
                    b.vx += nx * force; b.vy += ny * force;
                    b.vx *= 0.92; b.vy *= 0.92;
                }
            });
        }

        if (hand.gesture === GestureType.POINT) {
             bubbles.current.forEach(b => {
                if (Date.now() - b.creationTime < 1500) return;
                const d = Math.hypot(b.x - indexTip.x, b.y - indexTip.y);
                if (d < b.radius + 80 && d < closestDistToFinger) {
                    closestDistToFinger = d;
                    lockedTarget.current = { id: b.id, x: b.x, y: b.y, r: b.radius };
                }
             });
        }
    });

    // MOUSE INTERACTION
    const { x: mx, y: my, isDown, isRightDown, isDragging } = mouseRef.current;
    if (isRightDown) {
         bubbles.current.forEach(b => {
            const dx = b.x - mx; const dy = b.y - my;
            const dist = Math.hypot(dx, dy);
            const repelRange = 120 + b.radius;
            if (dist < repelRange && dist > 0) {
                const nx = dx / dist; const ny = dy / dist;
                const force = Math.pow((1 - dist / repelRange), 2) * 6.0; 
                b.vx += nx * force; b.vy += ny * force; b.vx *= 0.95; b.vy *= 0.95;
            }
        });
        mouseTrailRef.current = null;
    }

    if (isDown) {
        if (isDragging) {
             if (activeBubbleCreation.current) activeBubbleCreation.current = null;
             if (!mouseTrailRef.current) mouseTrailRef.current = { x: mx, y: my };
             const distMoved = Math.hypot(mx - mouseTrailRef.current.x, my - mouseTrailRef.current.y);
             if (distMoved > 15) {
                 const count = Math.min(Math.floor(distMoved / 15), 5); 
                 for (let s = 1; s <= count; s++) {
                     if (bubbles.current.length >= MAX_BUBBLES + 10) break;
                     const t = s / count;
                     const tx = lerp(mouseTrailRef.current.x, mx, t);
                     const ty = lerp(mouseTrailRef.current.y, my, t);
                     const trailBubble = createBubble(tx, ty, randomRange(15, 25), mouseRef.current.vx * 0.1, mouseRef.current.vy * 0.1, true);
                     bubbles.current.push(...trailBubble);
                 }
                 mouseTrailRef.current = { x: mx, y: my };
             }
        } else {
             if (activeBubbleCreation.current) {
                 activeBubbleCreation.current.x = mx;
                 activeBubbleCreation.current.y = my;
                 activeBubbleCreation.current.radius += 1.0;
                 activeBubbleCreation.current.timer++;
             }
        }
    }

    const isPinching = handResults.current.some(h => h.gesture === GestureType.PINCH);
    if (!isPinching && !isDown && activeBubbleCreation.current) {
         if (activeBubbleCreation.current.radius > 20) {
            const newBubbles = createBubble(activeBubbleCreation.current.x, activeBubbleCreation.current.y, activeBubbleCreation.current.radius);
            newBubbles.forEach(b => { b.vy = -2; b.vx = 0; bubbles.current.push(b); });
        }
        activeBubbleCreation.current = null;
    }

    if (activeBubbleCreation.current) {
        ctx.beginPath();
        ctx.strokeStyle = mode === VisualMode.INK ? 'rgba(0,0,0,0.8)' : '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.arc(activeBubbleCreation.current.x, activeBubbleCreation.current.y, activeBubbleCreation.current.radius, 0, Math.PI*2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    spawnTimer.current++;
    if (spawnTimer.current > BUBBLE_SPAWN_RATE && bubbles.current.length < 15 && !activeBubbleCreation.current) {
      const newBubbles = createBubble(randomRange(50, width-50), height + 50);
      bubbles.current.push(...newBubbles);
      spawnTimer.current = 0;
    }

    bubbles.current.sort((a,b) => a.radius - b.radius);

    for (let i = 0; i < bubbles.current.length; i++) {
        const b1 = bubbles.current[i];
        if (b1.state === BubbleState.FROZEN || b1.state === BubbleState.SHATTERED) continue;

        for (let j = i + 1; j < bubbles.current.length; j++) {
            const b2 = bubbles.current[j];
            if (b2.state === BubbleState.FROZEN || b2.state === BubbleState.SHATTERED) continue;
            
            if (Math.abs(b1.x - b2.x) > 300 || Math.abs(b1.y - b2.y) > 300) continue; 
            const d = dist(b1, b2);
            const isTrailBoth = b1.isTrail && b2.isTrail;
            const immunity = 2000;
            const isYoungTrailPair = isTrailBoth && (now - b1.creationTime < immunity || now - b2.creationTime < immunity);
            const rSum = b1.radius + b2.radius;
            const stickDist = rSum * (isTrailBoth ? 1.8 : 1.6); 
            
            if (d < stickDist) {
                 const u = 1 - (d / stickDist); 
                 if (isYoungTrailPair) {
                     if (d < rSum) {
                         const repelForce = 0.05 * u; 
                         const ax = (b2.x - b1.x) / d * repelForce;
                         const ay = (b2.y - b1.y) / d * repelForce;
                         b1.vx -= ax; b1.vy -= ay; b2.vx += ax; b2.vy += ay;
                     } 
                     else if (d < rSum * 1.5) {
                         const attractForce = 0.001;
                         const ax = (b2.x - b1.x) * attractForce;
                         const ay = (b2.y - b1.y) * attractForce;
                         b1.vx += ax; b1.vy += ay; b2.vx -= ax; b2.vy -= ay;
                     }
                 } else {
                     let force = 0.0001; if (isTrailBoth) force = 0.002; 
                     if (u > 0.1) {
                         const ax = (b2.x - b1.x) * force;
                         const ay = (b2.y - b1.y) * force;
                         b1.vx += ax; b1.vy += ay; b2.vx -= ax; b2.vy -= ay;
                     }
                 }

                 if (d > rSum * 0.4 && mode !== VisualMode.INK) { 
                    // Draw ligaments only for non-ink modes
                    const angle = Math.atan2(b2.y - b1.y, b2.x - b1.x);
                    const spread = 0.5 + u * 0.6; 
                    const angleOff1 = Math.acos(Math.min(b1.radius * 0.8 / d, 1)) * spread; 
                    const angleOff2 = Math.acos(Math.min(b2.radius * 0.8 / d, 1)) * spread;
                    const p1a = { x: b1.x + Math.cos(angle + angleOff1) * b1.radius * 0.9, y: b1.y + Math.sin(angle + angleOff1) * b1.radius * 0.9 };
                    const p1b = { x: b1.x + Math.cos(angle - angleOff1) * b1.radius * 0.9, y: b1.y + Math.sin(angle - angleOff1) * b1.radius * 0.9 };
                    const p2a = { x: b2.x + Math.cos(angle + Math.PI - angleOff2) * b2.radius * 0.9, y: b2.y + Math.sin(angle + Math.PI - angleOff2) * b2.radius * 0.9 };
                    const p2b = { x: b2.x + Math.cos(angle + Math.PI + angleOff2) * b2.radius * 0.9, y: b2.y + Math.sin(angle + Math.PI + angleOff2) * b2.radius * 0.9 };
                    ctx.beginPath();
                    ctx.moveTo(p1a.x, p1a.y);
                    ctx.quadraticCurveTo((b1.x + b2.x)/2, (b1.y + b2.y)/2, p2a.x, p2a.y);
                    ctx.lineTo(p2b.x, p2b.y);
                    ctx.quadraticCurveTo((b1.x + b2.x)/2, (b1.y + b2.y)/2, p1b.x, p1b.y);
                    ctx.globalCompositeOperation = mode === VisualMode.RETRO ? 'source-over' : 'overlay'; 
                    const alpha = isTrailBoth ? u * 0.15 : u * 0.4;
                    ctx.fillStyle = mode === VisualMode.RETRO ? `rgba(0, 255, 0, ${alpha})` : `rgba(220, 220, 220, ${alpha})`; 
                    ctx.fill();
                 }
            }

            if (d < rSum * 0.4) { 
                if (!isYoungTrailPair) {
                    const totalMass = b1.mass + b2.mass;
                    const newArea = (Math.PI * b1.radius * b1.radius) + (Math.PI * b2.radius * b2.radius);
                    const newRadius = Math.sqrt(newArea / Math.PI);
                    b1.x = (b1.x * b1.mass + b2.x * b2.mass) / totalMass;
                    b1.y = (b1.y * b1.mass + b2.y * b2.mass) / totalMass;
                    b1.vx = (b1.vx * b1.mass + b2.vx * b2.mass) / totalMass;
                    b1.vy = (b1.vy * b1.mass + b2.vy * b2.mass) / totalMass;
                    b1.radius = Math.min(newRadius, 220); 
                    b1.mass = totalMass;
                    bubbles.current.splice(j, 1);
                    j--; 
                }
            }
        }
    }

    for (let i = bubbles.current.length - 1; i >= 0; i--) {
      const b = bubbles.current[i];
      b.phase += 0.05;
      b.rotation += b.rotationSpeed;
      b.wobble *= 0.95;

      let hitHand = null;
      if (lockedTarget.current && lockedTarget.current.id === b.id) {
           for (const hand of handResults.current) {
              if (hand.gesture === GestureType.POINT) {
                  const indexTip = { x: hand.landmarks[INDEX_TIP].x * width, y: hand.landmarks[INDEX_TIP].y * height };
                  const d = Math.hypot(b.x - indexTip.x, b.y - indexTip.y);
                  if (d < b.radius + 15) { hitHand = hand; break; }
              }
           }
      }

      if (hitHand) {
          const handSpeed = Math.hypot(hitHand.velocity.x, hitHand.velocity.y);
          if (handSpeed > 10) {
              createParticles(b, 'POPPING');
              bubbles.current.splice(i, 1);
              onExpandUniverse(b.theme);
              continue;
          } 
          else if (b.state === BubbleState.FLOATING) {
              const chance = Math.random();
              if (chance < 0.25) { b.state = BubbleState.FROZEN; b.stateTimer = 0; b.vx *= 0.1; b.vy = 0; } 
              else if (chance < 0.5) { createParticles(b, 'MELT'); bubbles.current.splice(i, 1); onExpandUniverse(b.theme); continue; } 
              else if (chance < 0.75) { createParticles(b, 'EVAPORATE'); bubbles.current.splice(i, 1); onExpandUniverse(b.theme); continue; } 
              else { createParticles(b, 'POPPING'); bubbles.current.splice(i, 1); onExpandUniverse(b.theme); continue; }
          }
      }

      if (b.state === BubbleState.FROZEN) {
          b.stateTimer += 0.008; 
          if (b.stateTimer > 1.0) b.vy += GRAVITY * 3; 
          else { b.vx *= 0.9; b.vy *= 0.9; }
          b.x += b.vx; b.y += b.vy;
          if (b.y > height - b.radius) { createParticles(b, 'SHATTER'); bubbles.current.splice(i, 1); continue; }
      } else {
          b.vy -= GRAVITY * 0.6; b.vx *= AIR_RESISTANCE; b.vy *= AIR_RESISTANCE;
          if (b.x < b.radius) { b.x = b.radius; b.vx *= -0.8; }
          if (b.x > width - b.radius) { b.x = width - b.radius; b.vx *= -0.8; }
          if (b.y < -b.radius * 2) { bubbles.current.splice(i, 1); continue; }
          b.x += b.vx; b.y += b.vy;
      }
      drawBubble(ctx, b);
    }

    // Particles Loop
    for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i];
        if (p.type === 'FLASH') { } 
        else if (p.type === 'RING') { p.size += 5; } 
        else if (p.type === 'LIQUID') { p.stretch += 0.05; p.vx *= 0.96; p.vy += GRAVITY * 1.5; } 
        else if (p.type === 'SHARD') { p.vy += GRAVITY * 3; } 
        else if (p.type === 'MIST') { p.vy -= 0.08; p.size += 0.5; } 
        else if (p.type === 'SPARK') { p.vx *= 0.92; p.vy *= 0.92; p.vy += GRAVITY * 0.5; }

        if ((p.type === 'LIQUID' || p.type === 'SHARD') && p.y > height - 5) {
            p.y = height - 5; p.vx *= 0.5; p.vy = 0; p.onGround = true;
        } else if (p.type !== 'FLASH' && p.type !== 'RING') {
            p.x += p.vx; p.y += p.vy;
        }
        
        if (p.onGround) { p.life -= 0.01; p.size += 0.05; p.stretch = 0.2; } 
        else { p.life -= (1.0 / p.maxLife) * 0.02; }
        p.rotation += p.rotationSpeed;

        if (p.life <= 0) { particles.current.splice(i, 1); continue; }

        ctx.save();
        if (p.type === 'MIST') ctx.globalAlpha = (p.life / p.maxLife) * 0.5;
        else ctx.globalAlpha = p.life / p.maxLife;

        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        
        const isInk = mode === VisualMode.INK;
        const particleColor = isInk ? '#000000' : p.color;

        // --- PARTICLE RENDERING ADAPTATIONS ---
        if (p.type === 'FLASH') {
            ctx.globalCompositeOperation = isInk ? 'multiply' : 'lighter';
            const grad = ctx.createRadialGradient(0,0,0,0,0,p.size);
            if (isInk) { grad.addColorStop(0, 'rgba(0,0,0,0.5)'); grad.addColorStop(1, 'rgba(0,0,0,0)'); } 
            else { grad.addColorStop(0, '#FFFFFF'); grad.addColorStop(1, 'rgba(255,255,255,0)'); }
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(0,0, p.size, 0, Math.PI*2); ctx.fill();
        } else if (p.type === 'RING') {
            ctx.globalCompositeOperation = isInk ? 'source-over' : 'screen';
            ctx.strokeStyle = particleColor;
            ctx.lineWidth = 4 * (p.life / p.maxLife); 
            ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.stroke();
        } else if (p.type === 'SPARK') {
            ctx.globalCompositeOperation = isInk ? 'source-over' : 'screen';
            ctx.fillStyle = particleColor;
            ctx.beginPath();
            const v = Math.hypot(p.vx, p.vy);
            const l = Math.min(v * 2, 20);
            ctx.ellipse(0, 0, l, Math.max(1, p.size), 0, 0, Math.PI*2);
            ctx.fill();
        } else if (p.type === 'MIST') {
            ctx.globalCompositeOperation = isInk ? 'source-over' : 'screen';
            ctx.filter = 'blur(16px)'; 
            ctx.fillStyle = particleColor;
            ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI*2); ctx.fill();
            ctx.filter = 'none';
        } else {
            // Default particle
            ctx.fillStyle = particleColor;
            ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    }
    
    // RETRO Mode Scanline Overlay
    if (mode === VisualMode.RETRO) {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        for(let i=0; i<height; i+=4) {
            ctx.fillRect(0, i, width, 1);
        }
    }

    frameCount.current++;
    requestRef.current = requestAnimationFrame(update);
  };

  useEffect(() => {
    const init = async () => {
      try {
        await initializeVision();
        if (videoRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 1280, height: 720, facingMode: "user" } 
          });
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (e) {
        console.error("Camera init failed", e);
      }
    };
    init();

    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    requestRef.current = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [mode]);

  return (
    <div className="relative w-full h-full">
        <video 
            ref={videoRef} 
            className="absolute top-0 left-0 w-full h-full object-cover opacity-0 pointer-events-none scale-x-[-1]"
            playsInline
            muted
        />
        <canvas 
            ref={canvasRef} 
            className="block w-full h-full cursor-crosshair" 
            onContextMenu={(e) => e.preventDefault()}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
        />
    </div>
  );
};

export default MicroverseCanvas;