
import React, { useEffect, useRef } from 'react';
import { getHandLandmarker, initializeVision } from '../services/vision';
import { Bubble, BubbleTheme, BubbleElement, BubbleState, HandData, Particle, Vector2, GestureType } from '../types';
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
  mode: 'MEDITATION' | 'LAB' | 'ARTIST';
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

// History buffer size for gesture stabilization
const GESTURE_HISTORY_SIZE = 6;

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

  // Helpers
  const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;
  const dist = (p1: Vector2, p2: Vector2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
  
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
    
    // 1. POPPING SPECIAL EFFECTS (Flash + Shockwave)
    if (type === 'POPPING') {
        // A. Central Flash (Instant bright burst)
        particles.current.push({
            id: Math.random().toString(),
            x: b.x, y: b.y,
            vx: 0, vy: 0,
            life: 0.15, // Very short life
            maxLife: 0.15,
            color: '#FFFFFF',
            size: b.radius * 2.5,
            type: 'FLASH',
            rotation: 0, rotationSpeed: 0, stretch: 1, onGround: false, element: b.element
        });

        // B. Shockwave Ring (Expanding circle)
        particles.current.push({
            id: Math.random().toString(),
            x: b.x, y: b.y,
            vx: 0, vy: 0,
            life: 0.4,
            maxLife: 0.4,
            color: `hsl(${b.hue}, 100%, 80%)`,
            size: b.radius, // Start at bubble size
            type: 'RING',
            rotation: 0, rotationSpeed: 0, stretch: 1, onGround: false, element: b.element
        });

        // C. High Velocity Spray (The "Pop")
        const count = 50;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = randomRange(5, 25); 
            
            particles.current.push({
                id: Math.random().toString(),
                x: b.x + Math.cos(angle) * b.radius * 0.5,
                y: b.y + Math.sin(angle) * b.radius * 0.5,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: randomRange(0.3, 0.6),
                maxLife: 0.6,
                color: `hsl(${b.hue}, 100%, 90%)`,
                size: randomRange(2, 5),
                type: 'SPARK', 
                rotation: angle,
                rotationSpeed: 0,
                stretch: randomRange(2, 5), 
                element: b.element,
                onGround: false
            });
        }

        // D. Residual Mist (The "Smoke")
        for (let i = 0; i < 10; i++) {
            particles.current.push({
                id: Math.random().toString(),
                x: b.x + randomRange(-20, 20),
                y: b.y + randomRange(-20, 20),
                vx: randomRange(-2, 2),
                vy: randomRange(-2, 2),
                life: randomRange(0.5, 1.0),
                maxLife: 1.0,
                color: THEME_COLORS[b.theme].glow,
                size: randomRange(20, 50),
                type: 'MIST',
                rotation: Math.random() * Math.PI,
                rotationSpeed: randomRange(-0.05, 0.05),
                stretch: 1,
                element: b.element,
                onGround: false
            });
        }
        return; 
    }

    // ... Standard effects ...
    const count = type === 'SHATTER' ? 30 : (type === 'EVAPORATE' ? 50 : 25);
    
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = randomRange(2, 12);
        
        let pType: ExtendedParticle['type'] = 'MIST';
        let life = 1.0;
        let vy = Math.sin(angle) * speed;
        let vx = Math.cos(angle) * speed;
        let size = randomRange(2, 6);
        let color = `hsl(${b.hue}, 100%, 90%)`; 
        let stretch = 1.0;

        if (type === 'SHATTER') {
            pType = 'SHARD';
            vy = randomRange(-5, 2); 
            vx = randomRange(-4, 4);
            life = randomRange(1.5, 2.5);
            size = randomRange(3, 12);
            color = 'rgba(230, 250, 255, 0.95)';
        } else if (type === 'MELT') {
            pType = 'LIQUID';
            vx = randomRange(-1.0, 1.0);
            vy = randomRange(2, 6); // Faster initial drop
            life = randomRange(2.0, 3.5);
            size = randomRange(4, 9);
            stretch = randomRange(1.5, 3.0); 
            color = `hsla(${b.hue}, 90%, 80%, 0.85)`;
        } else if (type === 'EVAPORATE') {
            // Anti-gravity for evaporation
            pType = 'MIST';
            vx = randomRange(-1.5, 1.5);
            vy = randomRange(-1, -4); // Rise up
            life = randomRange(1.0, 2.0);
            size = randomRange(15, 40);
            color = THEME_COLORS[b.theme].glow;
        } else {
            pType = 'MIST';
            vy = randomRange(-2, -5); 
            life = 0.8;
            size = randomRange(10, 30);
            color = THEME_COLORS[b.theme].glow;
        }

        particles.current.push({
            id: Math.random().toString(),
            x: b.x + Math.cos(angle) * b.radius * 0.8,
            y: b.y + Math.sin(angle) * b.radius * 0.8,
            vx, vy, life, color, size, type: pType,
            rotation: Math.random() * Math.PI,
            rotationSpeed: randomRange(-0.2, 0.2),
            stretch,
            element: b.element,
            onGround: false,
            maxLife: life
        } as ExtendedParticle);
    }
  };

  // --- MOUSE EVENT HANDLERS ---
  const handleMouseDown = (e: React.MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Right Click logic
      if (e.button === 2) {
          mouseRef.current.isRightDown = true;
          mouseRef.current.x = x;
          mouseRef.current.y = y;
          return;
      }

      // Left Click logic
      mouseRef.current.isDown = true;
      mouseRef.current.startX = x;
      mouseRef.current.startY = y;
      mouseRef.current.isDragging = false;
      mouseRef.current.x = x;
      mouseRef.current.y = y;
      mouseRef.current.downTime = Date.now();

      // CLICK INTERACTION: POP BUBBLE
      // If we click directly on a bubble, pop it immediately.
      let popped = false;
      for (let i = bubbles.current.length - 1; i >= 0; i--) {
          const b = bubbles.current[i];
          const d = Math.hypot(b.x - x, b.y - y);
          if (d < b.radius) {
              createParticles(b, 'POPPING');
              bubbles.current.splice(i, 1);
              onExpandUniverse(b.theme);
              popped = true;
              break; 
          }
      }

      if (!popped) {
          // LONG PRESS INIT: Start growing a bubble
          activeBubbleCreation.current = { x, y, radius: 10, timer: 0 };
      } else {
          // If we popped something, don't start creating immediately
          activeBubbleCreation.current = null;
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      mouseRef.current.vx = x - mouseRef.current.x;
      mouseRef.current.vy = y - mouseRef.current.y;
      mouseRef.current.x = x;
      mouseRef.current.y = y;

      if (mouseRef.current.isDown) {
          const distFromStart = Math.hypot(x - mouseRef.current.startX, y - mouseRef.current.startY);
          if (distFromStart > 10) { // Small threshold to detect drag vs click/hold
              mouseRef.current.isDragging = true;
          }
      }
  };

  const handleMouseUp = () => {
      mouseRef.current.isDown = false;
      mouseRef.current.isRightDown = false;
      
      // If we were growing a single bubble (Long Press), release it now
      if (activeBubbleCreation.current && !mouseRef.current.isDragging) {
          const { x, y, radius } = activeBubbleCreation.current;
          if (radius > 12) {
             const newBubbles = createBubble(x, y, radius);
             newBubbles.forEach(b => { b.vy = -2; b.vx = 0; bubbles.current.push(b); });
          }
      }
      
      activeBubbleCreation.current = null;
      mouseRef.current.isDragging = false;
      mouseTrailRef.current = null;
  };

  const handleMouseLeave = () => {
      handleMouseUp();
      mouseRef.current.x = -1000;
      mouseRef.current.y = -1000;
  };

  // --- VISUALIZATION: Holographic Skeleton ---
  const drawHandSkeleton = (ctx: CanvasRenderingContext2D, hand: HandData) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Fluorescent Bright Light Blue (Electric Cyan)
    const FLUORESCENT_BLUE = '#00FFFF'; // Intense Cyan
    const BRIGHT_CORE = '#F0FFFF'; // Near White for the core

    // Use source-over for cleaner edges (less ghostly smear)
    ctx.globalCompositeOperation = 'source-over'; 

    // Connections
    const connections = [
        [0,1,2,3,4], [0,5,6,7,8], [0,9,10,11,12], [0,13,14,15,16], [0,17,18,19,20],
        [5,9,13,17], [0,5], [0,17] // Palm connections
    ];

    // Glow Effect for Bones - Reduced Blur to prevent "smearing" look
    ctx.shadowBlur = 15;
    ctx.shadowColor = FLUORESCENT_BLUE;
    ctx.strokeStyle = FLUORESCENT_BLUE;
    ctx.lineWidth = 2; 

    // Draw Bones
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

    // Draw Joints - Intense bright core
    ctx.fillStyle = BRIGHT_CORE;
    ctx.shadowBlur = 20; 
    ctx.shadowColor = FLUORESCENT_BLUE;
    
    hand.landmarks.forEach((lm, index) => {
        ctx.beginPath();
        const r = (index === 0) ? 7 : 5; 
        ctx.arc(lm.x * ctx.canvas.width, lm.y * ctx.canvas.height, r, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Removed gesture text label to prevent "marks"/clutter
    // ctx.fillText(hand.gesture, ...) 

    // Special Effects per Gesture
    if (hand.gesture === GestureType.FIST) {
        ctx.beginPath();
        ctx.strokeStyle = `hsla(0, 100%, 70%, 0.3)`;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        const time = frameCount.current * 0.1;
        const pulse = Math.sin(time) * 10;
        ctx.arc(hand.center.x, hand.center.y, 100 + pulse, 0, Math.PI*2);
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (hand.gesture === GestureType.PINCH) {
        const thumb = hand.landmarks[THUMB_TIP];
        const index = hand.landmarks[INDEX_TIP];
        const cx = (thumb.x + index.x) / 2 * ctx.canvas.width;
        const cy = (thumb.y + index.y) / 2 * ctx.canvas.height;
        
        ctx.beginPath();
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = '#FFFF00';
        ctx.shadowBlur = 20;
        ctx.arc(cx, cy, 8, 0, Math.PI*2);
        ctx.fill();
    }
    
    ctx.restore();
  };

  const drawPhotorealisticBubble = (ctx: CanvasRenderingContext2D, b: Bubble) => {
    ctx.save();
    ctx.translate(b.x, b.y);

    // RESTORED: Default full opacity for all bubbles, including trails
    ctx.globalAlpha = 1.0;

    const time = frameCount.current * 0.02;
    const wobbleFactor = b.state === BubbleState.FROZEN ? 0 : 0.8;

    // Main Bubble Shape
    ctx.beginPath();
    const segments = 60;
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

    ctx.globalCompositeOperation = 'overlay'; 
    ctx.save();
    ctx.rotate(time * 0.2 + b.rotation); 
    ctx.scale(1.5, 1.5); 
    
    const oilGrad = ctx.createLinearGradient(-b.radius, -b.radius, b.radius, b.radius);
    oilGrad.addColorStop(0, `hsla(${b.hue - 40}, 100%, 50%, 0.5)`);
    oilGrad.addColorStop(0.5, `hsla(${b.hue + 40}, 100%, 50%, 0.5)`);
    oilGrad.addColorStop(1, `hsla(${b.hue}, 100%, 40%, 0.5)`);
    
    ctx.fillStyle = oilGrad;
    ctx.fill();
    ctx.restore();
    
    ctx.restore(); 

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `hsla(${b.hue}, 100%, 90%, 0.4)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.globalCompositeOperation = 'lighter';
    
    ctx.save();
    ctx.translate(-b.radius * 0.4, -b.radius * 0.45);
    ctx.rotate(-Math.PI / 4);
    
    ctx.beginPath();
    ctx.ellipse(0, 0, b.radius * 0.25, b.radius * 0.15, 0, 0, Math.PI * 2);
    const highlightGrad = ctx.createRadialGradient(0,0,0, 0,0, b.radius*0.25);
    highlightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    highlightGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
    highlightGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = highlightGrad;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(b.radius * 0.4, b.radius * 0.4);
    ctx.beginPath();
    ctx.arc(0, 0, b.radius * 0.08, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();
    ctx.restore();

    // IMPROVED ICE EFFECT: Crystal Fractal Patterns
    if (b.state === BubbleState.FROZEN) {
        ctx.save();
        ctx.clip(); 
        
        ctx.globalCompositeOperation = 'screen';
        ctx.strokeStyle = 'rgba(220, 255, 255, 0.9)'; // Brighter ice
        ctx.lineCap = 'butt';
        
        const growth = Math.min(b.stateTimer, 1.0);
        const seeds = 6; // Number of main crystal branches
        
        for (let i = 0; i < seeds; i++) {
            ctx.save();
            const angle = (i / seeds) * Math.PI * 2 + b.rotation + b.contentSeed;
            ctx.rotate(angle);
            
            const len = b.radius * 2.0 * growth;
            ctx.lineWidth = 2 * (1 - growth * 0.5);
            
            // Main Branch
            ctx.beginPath();
            ctx.moveTo(0,0);
            
            // Jagged path for realism
            let currR = 0;
            const zigStep = 10;
            while(currR < len) {
                currR += zigStep;
                const jitter = (Math.random() - 0.5) * 5;
                ctx.lineTo(currR, jitter);
            }
            ctx.stroke();

            // Sub-branches (Fractal look)
            if (len > b.radius * 0.3) {
                const subBranches = 4;
                for(let j=1; j<=subBranches; j++) {
                    const distAlong = len * (j/subBranches);
                    ctx.save();
                    ctx.translate(distAlong, 0);
                    ctx.rotate(Math.PI / 3); // 60 degrees
                    ctx.beginPath();
                    ctx.moveTo(0,0);
                    ctx.lineTo(len * 0.3 * (1 - j/subBranches), 0);
                    ctx.stroke();
                    ctx.restore();

                    ctx.save();
                    ctx.translate(distAlong, 0);
                    ctx.rotate(-Math.PI / 3); // -60 degrees
                    ctx.beginPath();
                    ctx.moveTo(0,0);
                    ctx.lineTo(len * 0.3 * (1 - j/subBranches), 0);
                    ctx.stroke();
                    ctx.restore();
                }
            }
            ctx.restore();
        }
        
        // Frosted Overlay
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = `rgba(200, 240, 255, ${growth * 0.6})`;
        ctx.fill();
        
        ctx.restore();
    }

    if (lockedTarget.current && lockedTarget.current.id === b.id) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, b.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, -b.radius-12); ctx.lineTo(0, -b.radius-4);
        ctx.moveTo(0, b.radius+4); ctx.lineTo(0, b.radius+12);
        ctx.moveTo(-b.radius-12, 0); ctx.lineTo(-b.radius-4, 0);
        ctx.moveTo(b.radius+4, 0); ctx.lineTo(b.radius+12, 0);
        ctx.stroke();
    }

    ctx.restore();
  };

  const drawBokehBackground = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
      ctx.fillStyle = '#020203'; 
      ctx.fillRect(0, 0, width, height);
  };

  const determineGesture = (hand: HandData, width: number, height: number): GestureType => {
      const l = hand.landmarks;
      const getP = (i: number) => ({ x: l[i].x * width, y: l[i].y * height });
      const dist2d = (i: number, j: number) => dist(getP(i), getP(j));

      const pinchDist = dist2d(THUMB_TIP, INDEX_TIP);
      const wrist = getP(WRIST);
      
      let curledCount = 0;
      if (dist2d(INDEX_TIP, INDEX_MCP) < 50) curledCount++;
      if (dist2d(MIDDLE_TIP, MIDDLE_MCP) < 50) curledCount++;
      if (dist2d(RING_TIP, RING_MCP) < 50) curledCount++;
      if (dist2d(PINKY_TIP, PINKY_MCP) < 50) curledCount++;

      if (curledCount >= 3) {
          return GestureType.FIST;
      }

      if (pinchDist < 50) { // High sensitivity
          return GestureType.PINCH;
      } 
      
      const indexExt = dist2d(INDEX_TIP, INDEX_MCP);
      const middleExt = dist2d(MIDDLE_TIP, MIDDLE_MCP);
      if (indexExt > 60 && (middleExt < 80 || indexExt > middleExt + 40)) {
          return GestureType.POINT;
      }

      return GestureType.OPEN_HAND;
  };

  const update = (time: number) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;

    drawBokehBackground(ctx, width, height, time * 0.001);

    const handLandmarker = getHandLandmarker();
    if (handLandmarker && videoRef.current && videoRef.current.readyState >= 2) {
       // Optimization: Only run detection if video frame has advanced
       if (videoRef.current.currentTime !== lastVideoTime.current) {
           lastVideoTime.current = videoRef.current.currentTime;
           const detections = handLandmarker.detectForVideo(videoRef.current, performance.now());
           
           handResults.current = detections.landmarks.map((landmarks, i) => {
             // Raw landmarks are 0-1
             const currentRawLandmarks = landmarks.map(lm => ({ x: 1 - lm.x, y: lm.y })); // Mirror X
             
             const rawCenter = { x: currentRawLandmarks[9].x * width, y: currentRawLandmarks[9].y * height };
             
             // --- ENHANCED SMOOTHING START ---
             const prev = prevHandData.current.get(i);
             
             let smoothedLandmarks: Vector2[] = [];
             let smoothedCenter = rawCenter;
             let smoothedVelocity = {x:0, y:0};
             let gestureHistory: GestureType[] = prev ? prev.gestureHistory : [];
             let lastTrailPos = prev?.lastTrailPos || rawCenter; // Preserve lastTrailPos

             if (prev) {
                 const distMoved = Math.hypot(rawCenter.x - prev.center.x, rawCenter.y - prev.center.y);
                 const alpha = Math.min(0.7, Math.max(0.15, distMoved * 0.015));
    
                 smoothedLandmarks = currentRawLandmarks.map((curr, idx) => {
                     const prevLm = prev.landmarks[idx];
                     return {
                         x: lerp(prevLm.x, curr.x, alpha),
                         y: lerp(prevLm.y, curr.y, alpha)
                     };
                 });
    
                 smoothedCenter = {
                     x: smoothedLandmarks[9].x * width,
                     y: smoothedLandmarks[9].y * height
                 };
    
                 smoothedVelocity = {
                     x: smoothedCenter.x - prev.center.x,
                     y: smoothedCenter.y - prev.center.y
                 };
             } else {
                 smoothedLandmarks = currentRawLandmarks;
                 smoothedCenter = rawCenter;
             }
             // --- ENHANCED SMOOTHING END ---
    
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
             if (gestureHistory.length > GESTURE_HISTORY_SIZE) {
                 gestureHistory.shift();
             }
    
             const counts: Record<string, number> = {};
             gestureHistory.forEach(g => { counts[g] = (counts[g] || 0) + 1; });
             
             let stableGesture = rawGesture;
             let maxCount = 0;
             Object.entries(counts).forEach(([g, count]) => {
                 if (count > maxCount) {
                     maxCount = count;
                     stableGesture = g as GestureType;
                 }
             });
    
             prevHandData.current.set(i, { 
                 landmarks: smoothedLandmarks, 
                 center: smoothedCenter, 
                 velocity: smoothedVelocity,
                 gestureHistory,
                 lastTrailPos
             });
    
             return {
                 ...tempHand,
                 gesture: stableGesture
             };
           });
       }
    }

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

        // FLUID TRAIL SPAWNING LOGIC with TURBULENCE
        if (hand.gesture === GestureType.OPEN_HAND) {
            const prevData = prevHandData.current.get(index);
            if (prevData && prevData.lastTrailPos) {
                 const distMoved = dist(hand.center, prevData.lastTrailPos);
                 // TIGHTER SPAWN STEP for sticky trail effect
                 const spawnStep = 15; 
                 
                 if (distMoved > spawnStep) {
                     const count = Math.min(Math.floor(distMoved / spawnStep), 5); // Cap per frame
                     
                     for (let s = 1; s <= count; s++) {
                         if (bubbles.current.length >= MAX_BUBBLES + 10) break; // Soft limit override
                         
                         const t = s / count;
                         const tx = lerp(prevData.lastTrailPos.x, hand.center.x, t);
                         const ty = lerp(prevData.lastTrailPos.y, hand.center.y, t);
                         
                         const r = randomRange(15, 25); 
                         const jitter = 5; // Reduced jitter for tighter packing
                         
                         // Reduced turbulence to keep line cleaner
                         const turbulenceX = (Math.random() - 0.5) * 1.5;
                         const turbulenceY = (Math.random() - 0.5) * 1.5;

                         const trailBubble = createBubble(
                             tx + randomRange(-jitter, jitter), 
                             ty + randomRange(-jitter, jitter), 
                             r,
                             hand.velocity.x * 0.15 + turbulenceX, 
                             hand.velocity.y * 0.15 + turbulenceY,
                             true // IS TRAIL = TRUE
                         );
                         bubbles.current.push(...trailBubble);
                     }
                     
                     // Update persistent position to current
                     prevData.lastTrailPos = hand.center;
                     prevHandData.current.set(index, prevData);
                 }
            }
        } else {
            // Reset trail position to avoid jumping lines when opening hand again
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
                    const force = Math.pow((1 - dist / repelRange), 2) * 20.0; 
                    b.vx += nx * force;
                    b.vy += ny * force;
                    b.vx *= 0.92;
                    b.vy *= 0.92;
                    b.rotationSpeed += randomRange(-0.1, 0.1);
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

    // MOUSE INTERACTION UPDATES
    const { x: mx, y: my, isDown, isRightDown, isDragging } = mouseRef.current;
    
    // Repel Logic (RIGHT CLICK DRAG)
    if (isRightDown) {
         bubbles.current.forEach(b => {
            const dx = b.x - mx;
            const dy = b.y - my;
            const dist = Math.hypot(dx, dy);
            const repelRange = 120 + b.radius;
            
            if (dist < repelRange && dist > 0) {
                const nx = dx / dist;
                const ny = dy / dist;
                // Slightly weaker repel than Fist
                const force = Math.pow((1 - dist / repelRange), 2) * 15.0; 
                b.vx += nx * force;
                b.vy += ny * force;
                b.vx *= 0.95;
                b.vy *= 0.95;
            }
        });
        // Reset trail ref if not dragging
        mouseTrailRef.current = null;
    }

    // Drag / Long Press Logic (LEFT CLICK)
    if (isDown) {
        if (isDragging) {
             // 1. Dragging: Cancel "Long Press Grow" if active
             if (activeBubbleCreation.current) {
                 activeBubbleCreation.current = null;
             }

             // 2. Dragging: Generate Trail (Stream)
             if (!mouseTrailRef.current) mouseTrailRef.current = { x: mx, y: my };
             
             const distMoved = Math.hypot(mx - mouseTrailRef.current.x, my - mouseTrailRef.current.y);
             const spawnStep = 15;

             if (distMoved > spawnStep) {
                 const count = Math.min(Math.floor(distMoved / spawnStep), 5); 
                 
                 for (let s = 1; s <= count; s++) {
                     if (bubbles.current.length >= MAX_BUBBLES + 10) break;
                     const t = s / count;
                     const tx = lerp(mouseTrailRef.current.x, mx, t);
                     const ty = lerp(mouseTrailRef.current.y, my, t);
                     
                     const r = randomRange(15, 25);
                     const jitter = 5;
                     
                     const trailBubble = createBubble(
                         tx + randomRange(-jitter, jitter), 
                         ty + randomRange(-jitter, jitter), 
                         r,
                         mouseRef.current.vx * 0.1 + (Math.random()-0.5)*1.5,
                         mouseRef.current.vy * 0.1 + (Math.random()-0.5)*1.5,
                         true // IS TRAIL
                     );
                     bubbles.current.push(...trailBubble);
                 }
                 mouseTrailRef.current = { x: mx, y: my };
             }

        } else {
             // 3. Long Press: Grow Bubble
             if (activeBubbleCreation.current) {
                 activeBubbleCreation.current.x = mx;
                 activeBubbleCreation.current.y = my;
                 activeBubbleCreation.current.radius += 1.0;
                 activeBubbleCreation.current.timer++;
             }
        }
    }


    const isPinching = handResults.current.some(h => h.gesture === GestureType.PINCH);
    // Auto-release if pinching stops or mouse isn't down involved
    if (!isPinching && !isDown && activeBubbleCreation.current) {
         if (activeBubbleCreation.current.radius > 20) {
            const newBubbles = createBubble(activeBubbleCreation.current.x, activeBubbleCreation.current.y, activeBubbleCreation.current.radius);
            newBubbles.forEach(b => { b.vy = -2; b.vx = 0; bubbles.current.push(b); });
        }
        activeBubbleCreation.current = null;
    }

    if (activeBubbleCreation.current) {
        ctx.beginPath();
        ctx.strokeStyle = '#FFFFFF';
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
            
            if (Math.abs(b1.x - b2.x) > 300) continue; 
            const d = dist(b1, b2);
            
            // Check if both bubbles are trails to increase "sticky" behavior
            const isTrailPair = b1.isTrail && b2.isTrail;
            const stickDist = (b1.radius + b2.radius) * (isTrailPair ? 1.8 : 1.6); 
            
            if (d < stickDist) {
                 const u = 1 - (d / stickDist); 
                 
                 // DRASTICALLY REDUCED MERGING FORCE FOR SLOWER MERGING
                 let force = 0.0001; // Base force (was 0.0005)
                 if (isTrailPair) force = 0.002; // Trail force (was 0.025) - Slows down the "snap" effect significantly
                 
                 if (u > 0.1) {
                     const ax = (b2.x - b1.x) * force;
                     const ay = (b2.y - b1.y) * force;
                     b1.vx += ax; b1.vy += ay;
                     b2.vx -= ax; b2.vy -= ay;
                 }

                 if (d > (b1.radius + b2.radius) * 0.4) { 
                    const angle = Math.atan2(b2.y - b1.y, b2.x - b1.x);
                    const spread = 0.5 + u * 0.6; // Thicker connections
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
                    
                    ctx.globalCompositeOperation = 'overlay'; 
                    // CHANGE: Reduce connection visibility for trails to match "fainter trail marks" request
                    // Normal connection is u * 0.4. Trails were u * 0.8 (sticky). Now making them u * 0.15 (very faint)
                    const alpha = isTrailPair ? u * 0.15 : u * 0.4;
                    // Lower brightness from white to light grey to reduce impact further
                    ctx.fillStyle = `rgba(220, 220, 220, ${alpha})`; 
                    ctx.fill();
                 }
            }

            const rSum = b1.radius + b2.radius;
            if (d < rSum * 0.4) { 
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
                  if (d < b.radius + 15) { 
                      hitHand = hand;
                      break;
                  }
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
              if (chance < 0.25) {
                  b.state = BubbleState.FROZEN;
                  b.stateTimer = 0; 
                  b.vx *= 0.1; b.vy = 0; 
              } else if (chance < 0.5) {
                  createParticles(b, 'MELT');
                  bubbles.current.splice(i, 1);
                  onExpandUniverse(b.theme);
                  continue;
              } else if (chance < 0.75) {
                  createParticles(b, 'EVAPORATE');
                  bubbles.current.splice(i, 1);
                  onExpandUniverse(b.theme);
                  continue;
              } else {
                  createParticles(b, 'POPPING');
                  bubbles.current.splice(i, 1);
                  onExpandUniverse(b.theme);
                  continue;
              }
          }
      }

      if (b.state === BubbleState.FROZEN) {
          b.stateTimer += 0.008; 
          if (b.stateTimer > 1.0) b.vy += GRAVITY * 3; 
          else { b.vx *= 0.9; b.vy *= 0.9; }
          b.x += b.vx;
          b.y += b.vy;
          if (b.y > height - b.radius) {
              createParticles(b, 'SHATTER');
              bubbles.current.splice(i, 1);
              continue;
          }
      } else {
          b.vy -= GRAVITY * 0.6; 
          b.vx *= AIR_RESISTANCE;
          b.vy *= AIR_RESISTANCE;
          
          if (b.x < b.radius) { b.x = b.radius; b.vx *= -0.8; }
          if (b.x > width - b.radius) { b.x = width - b.radius; b.vx *= -0.8; }
          if (b.y < -b.radius * 2) {
             bubbles.current.splice(i, 1);
             continue;
          }
          b.x += b.vx;
          b.y += b.vy;
      }

      drawPhotorealisticBubble(ctx, b);
    }

    for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i];
        
        if (p.type === 'FLASH') {
            // Flash doesn't move, just fades
        } else if (p.type === 'RING') {
            // Ring expands
            p.size += 5;
        } else if (p.type === 'LIQUID') {
            p.stretch += 0.05; 
            p.vx *= 0.96; 
            p.vy += GRAVITY * 1.5;
        } else if (p.type === 'SHARD') {
            p.vy += GRAVITY * 3;
        } else if (p.type === 'MIST') {
            p.vy -= 0.08; 
            p.size += 0.5; 
        } else if (p.type === 'SPARK') {
            // Drag
            p.vx *= 0.92; p.vy *= 0.92;
            p.vy += GRAVITY * 0.5; 
        }

        if ((p.type === 'LIQUID' || p.type === 'SHARD') && p.y > height - 5) {
            p.y = height - 5;
            p.vx *= 0.5; 
            p.vy = 0;
            p.onGround = true;
        } else if (p.type !== 'FLASH' && p.type !== 'RING') {
            p.x += p.vx;
            p.y += p.vy;
        }
        
        if (p.onGround) {
            p.life -= 0.01; 
            p.size += 0.05;
            p.stretch = 0.2; // Flatten out on ground
        } else {
            // Decay based on maxLife ratio
            p.life -= (1.0 / p.maxLife) * 0.02;
        }
        
        p.rotation += p.rotationSpeed;

        if (p.life <= 0) {
            particles.current.splice(i, 1);
            continue;
        }

        ctx.save();
        
        // MIST PARTICLES: Rising diffusion
        if (p.type === 'MIST') {
             ctx.globalAlpha = (p.life / p.maxLife) * 0.5;
        } else {
             ctx.globalAlpha = p.life / p.maxLife;
        }

        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        
        if (p.type === 'FLASH') {
            ctx.globalCompositeOperation = 'lighter';
            const grad = ctx.createRadialGradient(0,0,0,0,0,p.size);
            grad.addColorStop(0, '#FFFFFF');
            grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0,0, p.size, 0, Math.PI*2);
            ctx.fill();
        } else if (p.type === 'RING') {
            ctx.globalCompositeOperation = 'screen';
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 4 * (p.life / p.maxLife); // Thin out as it fades
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI * 2);
            ctx.stroke();
        } else if (p.type === 'SPARK') {
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = p.color;
            ctx.beginPath();
            // Draw elongated sparks based on velocity
            const v = Math.hypot(p.vx, p.vy);
            const l = Math.min(v * 2, 20);
            ctx.ellipse(0, 0, l, Math.max(1, p.size), 0, 0, Math.PI*2);
            ctx.fill();
        } else if (p.type === 'SHARD') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = p.color;
            ctx.beginPath();
            if (p.onGround) {
                 ctx.ellipse(0, 0, p.size, p.size * 0.3, 0, 0, Math.PI*2);
            } else {
                ctx.moveTo(0, -p.size);
                ctx.lineTo(p.size*0.6, p.size);
                ctx.lineTo(-p.size*0.6, p.size);
            }
            ctx.fill();
        } else if (p.type === 'LIQUID') {
            ctx.globalCompositeOperation = 'screen'; 
            
            const s = p.size;
            const stretch = p.stretch || 1.5;
            
            ctx.beginPath();
            if (p.onGround) {
                // Puddle effect
                ctx.ellipse(0, 0, p.size * 2, p.size * 0.5, 0, 0, Math.PI*2);
            } else {
                // Teardrop shape
                ctx.moveTo(0, -s * stretch);
                ctx.bezierCurveTo(s, -s * 0.5, s, s, 0, s);
                ctx.bezierCurveTo(-s, s, -s, -s * 0.5, 0, -s * stretch);
            }
            
            ctx.fillStyle = p.color;
            ctx.fill();

            // Shimmering Highlight for Liquid
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = '#FFFFFF';
            const shimmer = Math.sin(frameCount.current * 0.1) * s * 0.2;
            
            ctx.beginPath();
            if (!p.onGround) {
                ctx.ellipse(s*0.3 + shimmer, -s*0.3, s*0.2, s*0.3, Math.PI/4, 0, Math.PI*2);
                ctx.fill();
            }

        } else if (p.type === 'MIST') {
            ctx.globalCompositeOperation = 'screen';
            ctx.filter = 'blur(16px)'; // Softer blur for evaporation
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI*2);
            ctx.fill();
            ctx.filter = 'none';
        }
        ctx.restore();
    }
    
    if (noiseCanvasRef.current) {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.03; 
        const pat = ctx.createPattern(noiseCanvasRef.current, 'repeat');
        if (pat) {
            ctx.fillStyle = pat;
            ctx.fillRect(0,0,width,height);
        }
        ctx.restore();
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
  }, []);

  return (
    <div className="relative w-full h-full bg-black">
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
