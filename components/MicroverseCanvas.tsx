
import React, { useEffect, useRef } from 'react';
import { getHandLandmarker, initializeVision } from '../services/vision';
import { Bubble, BubbleTheme, BubbleElement, BubbleState, HandData, Particle, Vector2, GestureType } from '../types';
import { 
    GRAVITY, 
    AIR_RESISTANCE, 
    BUBBLE_SPAWN_RATE, 
    MAX_BUBBLES, 
    THEME_COLORS,
    THUMB_TIP, INDEX_TIP, INDEX_MCP, MIDDLE_TIP, RING_TIP, PINKY_TIP, MIDDLE_MCP, RING_MCP, PINKY_MCP
} from '../constants';

interface MicroverseCanvasProps {
  mode: 'MEDITATION' | 'LAB' | 'ARTIST';
  onExpandUniverse: (theme: BubbleTheme) => void;
}

interface ExtendedParticle extends Particle {
    type: 'LIQUID' | 'SHARD' | 'MIST' | 'SPARK';
    rotation: number;
    rotationSpeed: number;
    stretch: number; // For liquid viscosity
    onGround: boolean; // Physics state
    maxLife: number;
}

const MicroverseCanvas: React.FC<MicroverseCanvasProps> = ({ mode, onExpandUniverse }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(0);
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Simulation State
  const bubbles = useRef<Bubble[]>([]);
  const particles = useRef<ExtendedParticle[]>([]);
  const frameCount = useRef<number>(0);
  const spawnTimer = useRef<number>(0);
  const handResults = useRef<HandData[]>([]);
  
  // Smoothing: Store previous positions and velocities for adaptive filtering
  const prevHandData = useRef<Map<number, { center: Vector2, velocity: Vector2 }>>(new Map());
  
  // Interaction Logic
  const activeBubbleCreation = useRef<{ x: number, y: number, radius: number, timer: number } | null>(null);
  const lockedTarget = useRef<{ id: string, x: number, y: number, r: number } | null>(null);

  // Helpers
  const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;
  const dist = (p1: Vector2, p2: Vector2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
  
  // Enhanced Noise: 2D Perlin-ish approximation with time component
  const noise = (x: number, y: number, t: number) => {
      return Math.sin(x * 4.0 + t) * Math.cos(y * 3.5 + t * 0.5) * 0.5 + 
             Math.sin(x * 12.0 - t * 1.5) * 0.25;
  };

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

  const createBubble = (x: number, y: number, r: number | null = null, vx: number = 0, vy: number = 0): Bubble[] => {
    const themes = Object.values(BubbleTheme);
    const theme = themes[Math.floor(Math.random() * themes.length)];
    
    // Size logic
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
      creationTime: Date.now()
    };

    const newBubbles = [mainBubble];

    // Sticky Cluster Logic
    if (isLarge && Math.random() > 0.4) {
        const count = Math.floor(randomRange(1, 3));
        for(let i=0; i<count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const smallR = randomRange(15, 30);
            // Overlap intentionally for sticky look
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
                creationTime: Date.now()
            });
        }
    }

    return newBubbles;
  };

  const createParticles = (b: Bubble, type: 'SHATTER' | 'MELT' | 'EVAPORATE' | 'POPPING') => {
    const count = type === 'SHATTER' ? 30 : (type === 'EVAPORATE' ? 40 : 25);
    
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
            vx = randomRange(-1.5, 1.5);
            vy = randomRange(0, 4);
            life = randomRange(2.0, 3.5);
            size = randomRange(3, 8);
            stretch = randomRange(1.2, 2.5); 
            color = `hsla(${b.hue}, 90%, 80%, 0.85)`;
        } else if (type === 'POPPING') {
            pType = 'SPARK'; 
            vx = Math.cos(angle) * speed * 2.5;
            vy = Math.sin(angle) * speed * 2.5;
            life = 0.4; 
            size = randomRange(1, 2.5); 
            color = '#FFFFFF';
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

  const drawHandSkeleton = (ctx: CanvasRenderingContext2D, hand: HandData) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const connections = [
        [0,1,2,3,4], [0,5,6,7,8], [0,9,10,11,12], [0,13,14,15,16], [0,17,18,19,20]
    ];

    ctx.shadowBlur = 15;
    ctx.shadowColor = hand.gesture === GestureType.FIST ? 'rgba(255, 100, 100, 0.6)' : 'rgba(150, 255, 255, 0.5)';
    ctx.strokeStyle = hand.gesture === GestureType.FIST ? 'rgba(255, 200, 200, 0.8)' : 'rgba(220, 255, 255, 0.6)';
    ctx.lineWidth = 3;

    connections.forEach(finger => {
        ctx.beginPath();
        for(let i = 0; i < finger.length - 1; i++) {
            const p1 = hand.landmarks[finger[i]];
            const p2 = hand.landmarks[finger[i+1]];
            const x1 = p1.x * ctx.canvas.width;
            const y1 = p1.y * ctx.canvas.height;
            const x2 = p2.x * ctx.canvas.width;
            const y2 = p2.y * ctx.canvas.height;
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
        ctx.stroke();
    });

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    hand.landmarks.forEach(lm => {
        ctx.beginPath();
        ctx.arc(lm.x * ctx.canvas.width, lm.y * ctx.canvas.height, 3, 0, Math.PI * 2);
        ctx.fill();
    });
    
    if (hand.gesture === GestureType.FIST) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.setLineDash([5, 5]);
        ctx.arc(hand.center.x, hand.center.y, 140, 0, Math.PI*2);
        ctx.stroke();
    }
    
    ctx.restore();
  };

  const drawPhotorealisticBubble = (ctx: CanvasRenderingContext2D, b: Bubble) => {
    ctx.save();
    ctx.translate(b.x, b.y);

    const time = frameCount.current * 0.02;
    const wobbleFactor = b.state === BubbleState.FROZEN ? 0 : 1;

    // 1. COMPLEX ORGANIC SHAPE (Double Noise)
    // Simulates liquid surface tension moving in two directions
    ctx.beginPath();
    const segments = 90;
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        // Layer 1: Slow large wobble
        const n1 = noise(Math.cos(theta), Math.sin(theta), time + b.rotation) * 0.04;
        // Layer 2: Fast small ripples
        const n2 = noise(Math.cos(theta) * 3, Math.sin(theta) * 3, -time * 2) * 0.02;
        
        const r = b.radius * (1 + (n1 + n2) * wobbleFactor);
        const x = Math.cos(theta) * r;
        const y = Math.sin(theta) * r;
        if (i===0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // 2. GLASS BODY (Deep Transparency with Fresnel Edge)
    // Instead of filling it white, we use a very subtle gradient that is mostly clear
    const glassGrad = ctx.createRadialGradient(-b.radius*0.3, -b.radius*0.3, 0, 0, 0, b.radius);
    glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.02)'); 
    glassGrad.addColorStop(0.8, 'rgba(255, 255, 255, 0.05)'); 
    glassGrad.addColorStop(1, 'rgba(255, 255, 255, 0.3)'); // Edge thickness
    ctx.fillStyle = glassGrad;
    ctx.fill();

    // Clip for internal texture
    ctx.save();
    ctx.clip();

    // 3. THIN FILM IRIDESCENCE (Distorted & Colorful)
    ctx.save();
    ctx.globalCompositeOperation = 'screen'; 
    // We rotate the iridescence opposite to bubble to simulate fluid moving across surface
    ctx.rotate(Math.sin(time) * 0.5); 
    
    const iridGrad = ctx.createRadialGradient(
        b.radius * 0.2, b.radius * 0.2, 0, 
        0, 0, b.radius * 1.2
    );
    
    const h = b.hue;
    
    // More complex banding for realism
    iridGrad.addColorStop(0, `hsla(${h}, 100%, 90%, 0)`);       
    iridGrad.addColorStop(0.4, `hsla(${h - 30}, 100%, 70%, 0.1)`); 
    iridGrad.addColorStop(0.65, `hsla(${h}, 100%, 60%, 0.3)`); // Main Color
    iridGrad.addColorStop(0.75, `hsla(${h + 40}, 100%, 50%, 0.0)`); // Dark band
    iridGrad.addColorStop(0.85, `hsla(${h + 160}, 100%, 80%, 0.5)`); // Interference compliment
    iridGrad.addColorStop(1, `hsla(${h}, 100%, 50%, 0)`);
    
    ctx.fillStyle = iridGrad;
    ctx.fill();
    ctx.restore();

    ctx.restore(); // End Clip

    // 4. RIM LIGHT (Ultra Sharp Edge)
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const rimGrad = ctx.createRadialGradient(0,0, b.radius * 0.9, 0,0, b.radius);
    rimGrad.addColorStop(0, 'rgba(255,255,255,0)');
    rimGrad.addColorStop(0.92, 'rgba(255, 255, 255, 0.1)');
    rimGrad.addColorStop(0.97, 'rgba(255, 255, 255, 0.9)');
    rimGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = rimGrad;
    ctx.fill();
    ctx.restore();

    // 5. PHYSICAL LENS FLARE (The "Real" Highlight)
    const hx = -b.radius * 0.45;
    const hy = -b.radius * 0.5;
    const flareSize = b.radius * 0.15;

    ctx.save();
    ctx.translate(hx, hy);
    // Rotate highlight slightly with wobble to look attached to surface
    ctx.rotate(noise(0,0,time) * 0.5);

    // Glow Halo
    ctx.globalCompositeOperation = 'screen';
    const flareGrad = ctx.createRadialGradient(0,0,0,0,0, flareSize*2);
    flareGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    flareGrad.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
    flareGrad.addColorStop(0.5, `hsla(${h}, 100%, 80%, 0.5)`); // Chromatic aberration
    flareGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = flareGrad;
    ctx.beginPath();
    ctx.arc(0,0, flareSize*2, 0, Math.PI*2);
    ctx.fill();

    // Cross Star (Diffraction spikes)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const spikeLen = flareSize * 2.5;
    ctx.moveTo(-spikeLen, 0); ctx.lineTo(spikeLen, 0);
    ctx.moveTo(0, -spikeLen); ctx.lineTo(0, spikeLen);
    ctx.stroke();

    // Core Hotspot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0,0, flareSize * 0.4, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();


    // --- FROST OVERLAY ---
    if (b.state === BubbleState.FROZEN) {
        ctx.save();
        ctx.clip(); 
        ctx.translate(0, 0);
        ctx.strokeStyle = 'rgba(220, 245, 255, 0.85)';
        ctx.lineWidth = 1.5;
        
        const growth = b.stateTimer; 
        const branches = 6; // Fewer, more distinct branches
        
        for (let i = 0; i < branches; i++) {
            ctx.save();
            ctx.rotate((i / branches) * Math.PI * 2 + b.rotation);
            const len = b.radius * 2.0 * growth;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            
            let cx = 0, cy = 0;
            const steps = 8;
            for(let j=0; j<steps; j++) {
                if ((j/steps)*b.radius > len) break;
                cx += (len/steps);
                cy += Math.sin(j * 2) * 3;
                ctx.lineTo(cx, cy);
                // Side needles
                if (j > 1) {
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx + 8, cy + 6);
                    ctx.moveTo(cx, cy);
                    ctx.lineTo(cx + 8, cy - 6);
                    ctx.moveTo(cx, cy);
                }
            }
            ctx.stroke();
            ctx.restore();
        }
        ctx.fillStyle = `rgba(200, 240, 255, ${growth * 0.25})`;
        ctx.fill();
        ctx.restore();
    }

    // TARGET LOCK UI
    if (lockedTarget.current && lockedTarget.current.id === b.id) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(0, 0, b.radius + 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.restore();
  };

  const drawBokehBackground = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);
  };

  const determineGesture = (hand: HandData, width: number, height: number): HandData => {
      const l = hand.landmarks;
      const getP = (i: number) => ({ x: (1 - l[i].x) * width, y: l[i].y * height });
      const dist2d = (i: number, j: number) => dist(getP(i), getP(j));

      const pinchDist = dist2d(THUMB_TIP, INDEX_TIP);
      
      let fingersCurled = 0;
      if (dist2d(INDEX_TIP, INDEX_MCP) < 60) fingersCurled++;
      if (dist2d(MIDDLE_TIP, MIDDLE_MCP) < 60) fingersCurled++;
      if (dist2d(RING_TIP, RING_MCP) < 60) fingersCurled++;
      if (dist2d(PINKY_TIP, PINKY_MCP) < 60) fingersCurled++;

      if (fingersCurled >= 3 && pinchDist > 20) {
          hand.gesture = GestureType.FIST;
      } 
      else if (pinchDist < 40) { 
          hand.gesture = GestureType.PINCH;
      } 
      else {
          const indexExt = dist2d(INDEX_TIP, INDEX_MCP);
          const middleExt = dist2d(MIDDLE_TIP, MIDDLE_MCP);
          if (indexExt > 60 && (middleExt < 100 || indexExt > middleExt + 30)) {
              hand.gesture = GestureType.POINT;
          } else {
               hand.gesture = GestureType.OPEN_HAND;
          }
      }
      return hand;
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
       const detections = handLandmarker.detectForVideo(videoRef.current, performance.now());
       
       handResults.current = detections.landmarks.map((landmarks, i) => {
         const rawHand = {
             landmarks,
             worldLandmarks: detections.worldLandmarks[i],
             handedness: detections.handedness[i][0].categoryName as 'Left' | 'Right',
             gesture: GestureType.NONE,
             pinchStrength: 0,
             center: {x:0, y:0},
             velocity: {x:0, y:0}
         };
         
         // Raw Center
         const rawCenter = { x: (1 - landmarks[9].x) * width, y: landmarks[9].y * height };
         
         // ADAPTIVE SMOOTHING
         // If moving fast -> High Alpha (Responsive)
         // If moving slow -> Low Alpha (Stable)
         const prev = prevHandData.current.get(i);
         let smoothedCenter = rawCenter;
         let smoothedVelocity = {x:0, y:0};

         if (prev) {
             const distMoved = Math.hypot(rawCenter.x - prev.center.x, rawCenter.y - prev.center.y);
             // Alpha 0.1 (very smooth) to 0.8 (very responsive)
             const alpha = Math.min(0.8, Math.max(0.1, distMoved * 0.02));
             
             smoothedCenter = {
                 x: prev.center.x + (rawCenter.x - prev.center.x) * alpha,
                 y: prev.center.y + (rawCenter.y - prev.center.y) * alpha
             };
             
             smoothedVelocity = {
                 x: smoothedCenter.x - prev.center.x,
                 y: smoothedCenter.y - prev.center.y
             };
         }
         
         prevHandData.current.set(i, { center: smoothedCenter, velocity: smoothedVelocity });

         const processedHand = determineGesture(rawHand, width, height);
         processedHand.center = smoothedCenter;
         processedHand.velocity = smoothedVelocity;
         
         // Mirror landmarks for drawing
         processedHand.landmarks = processedHand.landmarks.map(lm => ({ x: 1 - lm.x, y: lm.y }));
         
         return processedHand;
       });
    }

    lockedTarget.current = null;
    let closestDistToFinger = 9999;

    handResults.current.forEach(hand => {
        drawHandSkeleton(ctx, hand);
        const indexTip = { x: hand.landmarks[INDEX_TIP].x * width, y: hand.landmarks[INDEX_TIP].y * height };

        if (hand.gesture === GestureType.PINCH) {
            if (!activeBubbleCreation.current) {
                activeBubbleCreation.current = { x: indexTip.x, y: indexTip.y, radius: 15, timer: 0 };
            } else {
                // Drag the creation point with hand, but smooth it
                activeBubbleCreation.current.x = activeBubbleCreation.current.x * 0.8 + indexTip.x * 0.2;
                activeBubbleCreation.current.y = activeBubbleCreation.current.y * 0.8 + indexTip.y * 0.2;
                activeBubbleCreation.current.radius += 1.0; 
                activeBubbleCreation.current.timer++;
            }
        } 

        // TRAIL LOGIC (Enhanced Sticky)
        if (hand.gesture === GestureType.OPEN_HAND) {
            const speed = Math.hypot(hand.velocity.x, hand.velocity.y);
            // Higher spawn rate for smoother trail
            if (speed > 5 && frameCount.current % 2 === 0) {
                 const offsetX = randomRange(-10, 10);
                 const offsetY = randomRange(-10, 10);
                 const r = randomRange(15, 35); 
                 
                 const trailBubble = createBubble(
                     hand.center.x + offsetX, 
                     hand.center.y + offsetY, 
                     r,
                     hand.velocity.x * 0.2, // Transfer more hand momentum
                     hand.velocity.y * 0.2
                 );
                 bubbles.current.push(...trailBubble);
            }
        }

        if (hand.gesture === GestureType.FIST) {
            bubbles.current.forEach(b => {
                const dx = b.x - hand.center.x;
                const dy = b.y - hand.center.y;
                const dist = Math.hypot(dx, dy);
                const repelRange = 140 + b.radius;
                
                if (dist < repelRange && dist > 0) {
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const force = Math.pow((1 - dist / repelRange), 2) * 35.0; 
                    b.vx += nx * force;
                    b.vy += ny * force;
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

    const isPinching = handResults.current.some(h => h.gesture === GestureType.PINCH);
    if (!isPinching && activeBubbleCreation.current) {
         if (activeBubbleCreation.current.radius > 20) {
            const newBubbles = createBubble(activeBubbleCreation.current.x, activeBubbleCreation.current.y, activeBubbleCreation.current.radius);
            newBubbles.forEach(b => { b.vy = -2; b.vx = 0; bubbles.current.push(b); });
        }
        activeBubbleCreation.current = null;
    }

    if (activeBubbleCreation.current) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.arc(activeBubbleCreation.current.x, activeBubbleCreation.current.y, activeBubbleCreation.current.radius, 0, Math.PI*2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    spawnTimer.current++;
    if (spawnTimer.current > BUBBLE_SPAWN_RATE && bubbles.current.length < MAX_BUBBLES && !activeBubbleCreation.current) {
      const newBubbles = createBubble(randomRange(50, width-50), height + 50);
      bubbles.current.push(...newBubbles);
      spawnTimer.current = 0;
    }

    // Sort by radius so larger bubbles draw on top (or bottom, depending on preference)
    // Actually drawing larger on top looks better for transparency
    bubbles.current.sort((a,b) => a.radius - b.radius);

    for (let i = 0; i < bubbles.current.length; i++) {
        const b1 = bubbles.current[i];
        if (b1.state === BubbleState.FROZEN || b1.state === BubbleState.SHATTERED) continue;

        // Sticky Connections (Metaballs)
        for (let j = i + 1; j < bubbles.current.length; j++) {
            const b2 = bubbles.current[j];
            if (b2.state === BubbleState.FROZEN || b2.state === BubbleState.SHATTERED) continue;
            
            // Optimization: Skip very far bubbles
            if (Math.abs(b1.x - b2.x) > 300) continue; 

            const d = dist(b1, b2);
            // Distance where they start to "stick" visually
            const stickDist = (b1.radius + b2.radius) * 1.5; 
            
            if (d < stickDist) {
                 const u = 1 - (d / stickDist); // 0 to 1 strength
                 
                 // Physics: Cohesion force (pull together slightly)
                 if (u > 0.4) {
                     const ax = (b2.x - b1.x) * 0.001;
                     const ay = (b2.y - b1.y) * 0.001;
                     b1.vx += ax; b1.vy += ay;
                     b2.vx -= ax; b2.vy -= ay;
                 }

                 // Visual: Liquid Bridge
                 if (d > (b1.radius + b2.radius) * 0.5) { // Only draw if not fully merged
                    const angle = Math.atan2(b2.y - b1.y, b2.x - b1.x);
                    const spread = 0.5 + u * 0.5; // Wider when closer
                    const angleOff1 = Math.acos(Math.min(b1.radius * 0.8 / d, 1)) * spread; 
                    const angleOff2 = Math.acos(Math.min(b2.radius * 0.8 / d, 1)) * spread;

                    const p1a = { x: b1.x + Math.cos(angle + angleOff1) * b1.radius * 0.9, y: b1.y + Math.sin(angle + angleOff1) * b1.radius * 0.9 };
                    const p1b = { x: b1.x + Math.cos(angle - angleOff1) * b1.radius * 0.9, y: b1.y + Math.sin(angle - angleOff1) * b1.radius * 0.9 };
                    const p2a = { x: b2.x + Math.cos(angle + Math.PI - angleOff2) * b2.radius * 0.9, y: b2.y + Math.sin(angle + Math.PI - angleOff2) * b2.radius * 0.9 };
                    const p2b = { x: b2.x + Math.cos(angle + Math.PI + angleOff2) * b2.radius * 0.9, y: b2.y + Math.sin(angle + Math.PI + angleOff2) * b2.radius * 0.9 };

                    // Control points for bezier curve to simulate surface tension
                    const cp1 = { x: b1.x + Math.cos(angle) * b1.radius * 1.5, y: b1.y + Math.sin(angle) * b1.radius * 1.5 };
                    
                    ctx.beginPath();
                    ctx.moveTo(p1a.x, p1a.y);
                    // Smooth quadratic bridge
                    ctx.quadraticCurveTo((b1.x + b2.x)/2, (b1.y + b2.y)/2, p2a.x, p2a.y);
                    ctx.lineTo(p2b.x, p2b.y);
                    ctx.quadraticCurveTo((b1.x + b2.x)/2, (b1.y + b2.y)/2, p1b.x, p1b.y);
                    
                    // Fill with same glassy gradient
                    ctx.fillStyle = `rgba(255, 255, 255, ${u * 0.3})`; 
                    ctx.fill();
                 }
            }

            // Merge logic
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
          b.stateTimer += 0.005; 
          if (b.stateTimer > 1.0) b.vy += GRAVITY * 4; 
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
        
        if (p.type === 'LIQUID') {
            p.stretch += 0.05; 
            p.vx *= 0.96; 
            p.vy += GRAVITY * 1.5;
        } else if (p.type === 'SHARD') {
            p.vy += GRAVITY * 3;
        } else if (p.type === 'MIST') {
            p.vy -= 0.05;
        } else if (p.type === 'SPARK') {
            p.vx *= 0.9; p.vy *= 0.9;
        }

        if ((p.type === 'LIQUID' || p.type === 'SHARD') && p.y > height - 5) {
            p.y = height - 5;
            p.vx *= 0.5; 
            p.vy = 0;
            p.onGround = true;
        } else {
            p.x += p.vx;
            p.y += p.vy;
        }
        
        if (p.onGround) {
            p.life -= 0.008; 
            p.size += 0.05;
            p.stretch = 0.2; 
        } else {
            p.life -= 0.015;
        }
        
        p.rotation += p.rotationSpeed;

        if (p.life <= 0) {
            particles.current.splice(i, 1);
            continue;
        }

        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        
        if (p.type === 'SPARK') {
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = '#FFF';
            ctx.beginPath();
            ctx.arc(0,0, p.size, 0, Math.PI*2);
            ctx.fill();
        } else if (p.type === 'SHARD') {
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
            ctx.fillStyle = p.color;
            ctx.beginPath();
            if (p.onGround) {
                ctx.ellipse(0, 0, p.size * 2, p.size * 0.5, 0, 0, Math.PI*2);
            } else {
                const s = p.size;
                const stretch = p.stretch || 1.5;
                ctx.moveTo(0, -s * stretch);
                ctx.bezierCurveTo(s, -s * 0.5, s, s, 0, s);
                ctx.bezierCurveTo(-s, s, -s, -s * 0.5, 0, -s * stretch);
            }
            ctx.fill();
        } else {
            ctx.fillStyle = p.color;
            ctx.filter = 'blur(8px)';
            ctx.beginPath();
            ctx.arc(0, 0, p.size * 1.5, 0, Math.PI*2);
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
        <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};

export default MicroverseCanvas;
