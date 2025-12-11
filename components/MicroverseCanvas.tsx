
import React, { useEffect, useRef, useState } from 'react';
import { getHandLandmarker, initializeVision } from '../services/vision';
import { Bubble, BubbleTheme, BubbleElement, BubbleState, HandData, Particle, Vector2, GestureType } from '../types';
import { 
    GRAVITY, 
    AIR_RESISTANCE, 
    BUBBLE_SPAWN_RATE, 
    MAX_BUBBLES, 
    THEME_COLORS,
    WRIST, THUMB_TIP, INDEX_TIP, INDEX_MCP, MIDDLE_TIP, RING_TIP, PINKY_TIP, MIDDLE_MCP, RING_MCP, PINKY_MCP
} from '../constants';

interface MicroverseCanvasProps {
  mode: 'MEDITATION' | 'LAB' | 'ARTIST';
  onExpandUniverse: (theme: BubbleTheme) => void;
}

interface ExtendedParticle extends Particle {
    type: 'LIQUID' | 'SHARD' | 'MIST' | 'SPARK';
    rotation: number;
    rotationSpeed: number;
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
  const lastHandPos = useRef<{x: number, y: number} | null>(null);
  
  // Interaction Logic
  const activeBubbleCreation = useRef<{ x: number, y: number, radius: number, timer: number } | null>(null);
  // Target locking for UI feedback
  const lockedTarget = useRef<{ id: string, x: number, y: number, r: number } | null>(null);

  // Helpers
  const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;
  const dist = (p1: Vector2, p2: Vector2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
  
  // High freq noise for nano-wrinkles
  const noise = (x: number, y: number, t: number) => {
      return Math.sin(x * 8.0 + t) * 0.5 + Math.sin(y * 8.0 + t * 0.5) * 0.5;
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
    
    // Morphology
    const isLarge = r ? r > 50 : Math.random() > 0.90; 
    const radius = r || (isLarge ? randomRange(90, 130) : randomRange(15, 30));
    
    const element = getElementBehavior(theme);

    const mainBubble: Bubble = {
      id: Math.random().toString(36).substr(2, 9),
      x,
      y,
      radius,
      vx: vx !== 0 ? vx : 0,
      vy: vy !== 0 ? vy : randomRange(-0.3, -1.2),
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
      rotationSpeed: randomRange(-0.03, 0.03)
    };

    const newBubbles = [mainBubble];

    // Clustering
    if (isLarge && Math.random() > 0.2) {
        const count = Math.floor(randomRange(2, 4));
        for(let i=0; i<count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const smallR = randomRange(10, 18);
            const dist = radius + smallR - 2; 
            newBubbles.push({
                ...mainBubble,
                id: Math.random().toString(36).substr(2, 9),
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist,
                radius: smallR,
                vx: mainBubble.vx, 
                vy: mainBubble.vy,
                mass: smallR * smallR,
                contentSeed: Math.random()
            });
        }
    }

    return newBubbles;
  };

  const createParticles = (b: Bubble, type: 'SHATTER' | 'MELT' | 'EVAPORATE' | 'POPPING') => {
    const count = type === 'SHATTER' ? 25 : (type === 'EVAPORATE' ? 40 : 20);
    
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = randomRange(2, 12);
        
        let pType: ExtendedParticle['type'] = 'MIST';
        let life = 1.0;
        let vy = Math.sin(angle) * speed;
        let vx = Math.cos(angle) * speed;
        let size = randomRange(2, 6);
        let color = `hsl(${b.hue}, 100%, 90%)`; 

        if (type === 'SHATTER') {
            pType = 'SHARD';
            vy = randomRange(-8, -2); 
            vx = randomRange(-5, 5);
            life = 1.2;
            size = randomRange(3, 10);
            color = 'rgba(220, 250, 255, 0.95)';
        } else if (type === 'MELT') {
            pType = 'LIQUID';
            vy = randomRange(2, 8); 
            vx = randomRange(-1, 1);
            life = 1.5;
            color = `hsl(${b.hue}, 90%, 80%)`;
        } else if (type === 'POPPING') {
            pType = 'SPARK'; 
            vx = Math.cos(angle) * speed * 2.5;
            vy = Math.sin(angle) * speed * 2.5;
            life = 0.5;
            size = randomRange(1, 3);
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
            element: b.element 
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

    ctx.shadowBlur = 20;
    ctx.shadowColor = hand.gesture === GestureType.FIST ? 'rgba(255, 100, 100, 0.9)' : 'rgba(150, 255, 255, 0.9)';
    ctx.strokeStyle = hand.gesture === GestureType.FIST ? 'rgba(255, 200, 200, 0.9)' : 'rgba(220, 255, 255, 0.9)';
    ctx.lineWidth = 4;

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

    // Joints
    ctx.fillStyle = '#FFFFFF';
    hand.landmarks.forEach(lm => {
        ctx.beginPath();
        ctx.arc(lm.x * ctx.canvas.width, lm.y * ctx.canvas.height, 4, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Draw Repel Field for Fist
    if (hand.gesture === GestureType.FIST) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.setLineDash([5, 5]);
        ctx.arc(hand.center.x, hand.center.y, 120, 0, Math.PI*2);
        ctx.stroke();
    }
    
    ctx.restore();
  };

  const drawPhotorealisticBubble = (ctx: CanvasRenderingContext2D, b: Bubble) => {
    ctx.save();
    ctx.translate(b.x, b.y);

    const time = frameCount.current * 0.02;
    const wobbleFactor = b.state === BubbleState.FROZEN ? 0 : 1;

    // 1. DYNAMIC SHAPE
    ctx.beginPath();
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const wrinkle = noise(Math.cos(theta), Math.sin(theta), time * 2 + b.rotation) * (b.radius * 0.02) * wobbleFactor;
        const r = b.radius + wrinkle;
        const x = Math.cos(theta) * r;
        const y = Math.sin(theta) * r;
        if (i===0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // 2. BASE: "White Environment" Simulation
    // Instead of being transparent to black, we fill it with a very light semi-transparent white
    // This makes it look like it has "body" in a dark room.
    const bodyGrad = ctx.createRadialGradient(-b.radius*0.3, -b.radius*0.3, 0, 0, 0, b.radius);
    bodyGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)'); // Inner glow
    bodyGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.05)'); 
    bodyGrad.addColorStop(1, 'rgba(255, 255, 255, 0.3)'); // Edge density
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Clip for internal reflections
    ctx.save();
    ctx.clip();

    // 3. IRIDESCENT SWIRL (High Saturation over White)
    ctx.save();
    ctx.rotate(b.rotation);
    ctx.globalCompositeOperation = 'screen'; // Additive blending
    
    const iridGrad = ctx.createRadialGradient(
        -b.radius * 0.2, -b.radius * 0.4, 0,
        0, 0, b.radius * 1.1
    );
    
    const h = b.hue;
    const shift = Math.sin(b.rotation) * 40; 
    
    // Much brighter/whitened colors to pop against the "glass" body
    iridGrad.addColorStop(0, `hsla(${h + shift}, 100%, 98%, 0.6)`);       // Almost white center
    iridGrad.addColorStop(0.3, `hsla(${h + shift + 30}, 100%, 85%, 0.4)`); // Bright pastel
    iridGrad.addColorStop(0.6, `hsla(${h + shift + 180}, 100%, 90%, 0.3)`); // Secondary highlight
    iridGrad.addColorStop(1, `hsla(${h}, 100%, 50%, 0.0)`);
    
    ctx.fillStyle = iridGrad;
    ctx.fill();
    ctx.restore();

    // 4. REFLECTIONS (Sharp White Window)
    ctx.globalCompositeOperation = 'source-over'; // Paint on top
    ctx.save();
    ctx.rotate(-b.rotation * 0.5);
    
    // Top-Left Sharp Studio Light
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.roundRect(-b.radius*0.5, -b.radius*0.5, b.radius*0.4, b.radius*0.4, 4);
    ctx.fill();
    // Grid line in window
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(-b.radius*0.5, -b.radius*0.3);
    ctx.lineTo(-b.radius*0.1, -b.radius*0.3);
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.restore();
    ctx.restore(); // End Clip

    // 5. RIM LIGHT (Strong Fresnel)
    ctx.globalCompositeOperation = 'source-over';
    const rimGrad = ctx.createRadialGradient(0,0, b.radius * 0.85, 0,0, b.radius);
    rimGrad.addColorStop(0, 'rgba(255,255,255,0)');
    rimGrad.addColorStop(0.85, 'rgba(255,255,255,0.2)');
    rimGrad.addColorStop(0.95, 'rgba(255, 255, 255, 1.0)'); // Solid white edge
    rimGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = rimGrad;
    ctx.fill();

    // 6. SPECULAR HIGHLIGHTS
    const hx = -b.radius * 0.4;
    const hy = -b.radius * 0.45;
    
    // Soft outer glow
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.filter = 'blur(6px)';
    ctx.beginPath();
    ctx.arc(hx, hy, b.radius * 0.25, 0, Math.PI*2);
    ctx.fill();
    ctx.filter = 'none';

    // Core hot spot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(hx, hy, b.radius * 0.1, b.radius * 0.06, Math.PI/4, 0, Math.PI*2);
    ctx.fill();

    // 7. TARGET LOCK RETICLE (If active)
    if (lockedTarget.current && lockedTarget.current.id === b.id) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        const rotate = frameCount.current * 0.1;
        ctx.save();
        ctx.rotate(rotate);
        ctx.beginPath();
        // Draw brackets
        ctx.arc(0, 0, b.radius + 10, 0, Math.PI * 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, b.radius + 10, Math.PI, Math.PI * 1.5);
        ctx.stroke();
        ctx.restore();
        ctx.setLineDash([]);
    }

    // --- FREEZING EFFECT ---
    if (b.state === BubbleState.FROZEN) {
        ctx.save();
        ctx.clip(); // Clip to bubble shape
        const freezeRadius = b.radius * b.stateTimer * 2.5; 
        ctx.translate(0, 0);
        ctx.fillStyle = `rgba(220, 245, 255, ${Math.min(b.stateTimer, 0.7)})`;
        const iceSpikes = 20;
        ctx.beginPath();
        ctx.moveTo(0,0);
        for(let i=0; i<=iceSpikes*2; i++) {
            const angle = (i / (iceSpikes*2)) * Math.PI * 2;
            const len = (i%2===0 ? freezeRadius : freezeRadius * 0.4) * (0.8 + Math.random()*0.2);
            ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
        }
        ctx.fill();
        ctx.restore();
    }

    ctx.restore();
  };

  const drawBokehBackground = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number) => {
      // Background remains dark, but bubbles pop against it now due to internal fill
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#020205'); 
      grad.addColorStop(1, '#000000'); 
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
  };

  const determineGesture = (hand: HandData, width: number, height: number): HandData => {
      const l = hand.landmarks;
      // MIRRORING LOGIC: Flip X (1 - x)
      const getP = (i: number) => ({ x: (1 - l[i].x) * width, y: l[i].y * height });
      const dist2d = (i: number, j: number) => dist(getP(i), getP(j));

      const currentCenter = { x: (1 - l[9].x) * width, y: l[9].y * height };
      const velocity = { x: 0, y: 0 }; 

      hand.center = currentCenter;
      hand.velocity = velocity;

      const pinchDist = dist2d(THUMB_TIP, INDEX_TIP);
      const palmDist = dist(getP(INDEX_TIP), getP(WRIST));
      
      const tips = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];
      let tipsToWrist = 0;
      tips.forEach(t => tipsToWrist += dist(getP(t), getP(WRIST)));
      
      // OPTIMIZED SENSITIVITY
      
      // Fist: Check for curled fingers average
      let fingersCurled = 0;
      if (dist2d(INDEX_TIP, INDEX_MCP) < 50) fingersCurled++;
      if (dist2d(MIDDLE_TIP, MIDDLE_MCP) < 50) fingersCurled++;
      if (dist2d(RING_TIP, RING_MCP) < 50) fingersCurled++;
      if (dist2d(PINKY_TIP, PINKY_MCP) < 50) fingersCurled++;

      if (fingersCurled >= 3 && pinchDist > 20) {
          hand.gesture = GestureType.FIST;
      } 
      else if (pinchDist < 35) { // Relaxed pinch threshold
          hand.gesture = GestureType.PINCH;
      } 
      else {
          // Pointing logic: Index extended, others curled or just Index furthest out
          const indexExt = dist2d(INDEX_TIP, INDEX_MCP);
          const middleExt = dist2d(MIDDLE_TIP, MIDDLE_MCP);
          
          // Sensitivity Boost: If index is extended significantly more than middle, it's a point
          // Or if index is just extended and pinch is open
          if (indexExt > 60 && (middleExt < 100 || indexExt > middleExt + 30)) {
              hand.gesture = GestureType.POINT;
          } else {
               hand.gesture = GestureType.OPEN_HAND;
          }
      }

      // Re-inject landmarks with mirrored coordinates for drawing
      hand.landmarks = hand.landmarks.map(lm => ({ x: 1 - lm.x, y: lm.y }));

      return hand;
  };

  useEffect(() => {
     const nc = document.createElement('canvas');
     nc.width = 256;
     nc.height = 256;
     const nCtx = nc.getContext('2d');
     if (nCtx) {
         const id = nCtx.createImageData(256, 256);
         const d = id.data;
         for (let i = 0; i < d.length; i += 4) {
             const v = Math.random() * 255;
             d[i] = v; d[i+1] = v; d[i+2] = v; d[i+3] = 10; 
         }
         nCtx.putImageData(id, 0, 0);
         noiseCanvasRef.current = nc;
     }
  }, []);

  const update = (time: number) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;

    // 0. Background
    drawBokehBackground(ctx, width, height, time * 0.001);

    // 1. Process Vision & Gestures
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
         
         let estVelocity = {x:0, y:0};
         const currentRawCenter = { x: (1 - landmarks[9].x) * width, y: landmarks[9].y * height };
         
         if (lastHandPos.current) {
             estVelocity = {
                 x: currentRawCenter.x - lastHandPos.current.x,
                 y: currentRawCenter.y - lastHandPos.current.y
             };
         }
         
         const processedHand = determineGesture(rawHand, width, height);
         processedHand.velocity = estVelocity;
         return processedHand;
       });

       if (handResults.current.length > 0) {
           lastHandPos.current = handResults.current[0].center;
       }
    }

    // Reset lock
    lockedTarget.current = null;
    let closestDistToFinger = 9999;

    // 2. Execute Interactions
    handResults.current.forEach(hand => {
        drawHandSkeleton(ctx, hand);
        const indexTip = { x: hand.landmarks[INDEX_TIP].x * width, y: hand.landmarks[INDEX_TIP].y * height };

        // PINCH
        if (hand.gesture === GestureType.PINCH) {
            if (!activeBubbleCreation.current) {
                activeBubbleCreation.current = { x: indexTip.x, y: indexTip.y, radius: 10, timer: 0 };
            } else {
                activeBubbleCreation.current.x = indexTip.x;
                activeBubbleCreation.current.y = indexTip.y;
                activeBubbleCreation.current.radius += 0.8; 
                activeBubbleCreation.current.timer++;
            }
        } 

        // OPEN HAND
        if (hand.gesture === GestureType.OPEN_HAND) {
            const speed = Math.hypot(hand.velocity.x, hand.velocity.y);
            if (speed > 8 && frameCount.current % 4 === 0) {
                 const trailBubble = createBubble(hand.center.x, hand.center.y, randomRange(10, 25), hand.velocity.x * 0.1, hand.velocity.y * 0.1);
                 bubbles.current.push(...trailBubble);
            }
        }

        // FIST: PINBALL BOUNCE (High Elasticity)
        if (hand.gesture === GestureType.FIST) {
            bubbles.current.forEach(b => {
                const dx = b.x - hand.center.x;
                const dy = b.y - hand.center.y;
                const dist = Math.hypot(dx, dy);
                const repelRange = 140 + b.radius;
                
                if (dist < repelRange && dist > 0) {
                    // Impulse Physics
                    const nx = dx / dist;
                    const ny = dy / dist;
                    // Exponential force for "snap" feeling
                    const force = Math.pow((1 - dist / repelRange), 2) * 35.0; 
                    
                    b.vx += nx * force;
                    b.vy += ny * force;
                    
                    // Add some randomness to rotation on bounce
                    b.rotationSpeed += randomRange(-0.1, 0.1);
                }
            });
        }

        // TARGETING SYSTEM (Point)
        if (hand.gesture === GestureType.POINT) {
             bubbles.current.forEach(b => {
                const d = Math.hypot(b.x - indexTip.x, b.y - indexTip.y);
                if (d < b.radius + 60 && d < closestDistToFinger) {
                    closestDistToFinger = d;
                    lockedTarget.current = { id: b.id, x: b.x, y: b.y, r: b.radius };
                }
             });
        }
    });

    // Check pinch release
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
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
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

    bubbles.current.sort((a,b) => a.radius - b.radius);

    for (let i = 0; i < bubbles.current.length; i++) {
        const b1 = bubbles.current[i];
        if (b1.state === BubbleState.FROZEN || b1.state === BubbleState.SHATTERED) continue;

        for (let j = i + 1; j < bubbles.current.length; j++) {
            const b2 = bubbles.current[j];
            if (b2.state === BubbleState.FROZEN || b2.state === BubbleState.SHATTERED) continue;
            
            if (b1.radius < 15 || b2.radius < 15) continue; 
            
            const d = dist(b1, b2);
            const maxDist = (b1.radius + b2.radius) * 1.1;
            if (d < maxDist) {
                 const u = (maxDist - d) / ((b1.radius + b2.radius) * 0.2); 
                 if (u > 0) {
                    const angle = Math.atan2(b2.y - b1.y, b2.x - b1.x);
                    const angleOff1 = Math.acos(Math.min(b1.radius / d, 1)) * 0.6; 
                    const angleOff2 = Math.acos(Math.min(b2.radius / d, 1)) * 0.6;

                    const p1a = { x: b1.x + Math.cos(angle + angleOff1) * b1.radius, y: b1.y + Math.sin(angle + angleOff1) * b1.radius };
                    const p1b = { x: b1.x + Math.cos(angle - angleOff1) * b1.radius, y: b1.y + Math.sin(angle - angleOff1) * b1.radius };
                    const p2a = { x: b2.x + Math.cos(angle + Math.PI - angleOff2) * b2.radius, y: b2.y + Math.sin(angle + Math.PI - angleOff2) * b2.radius };
                    const p2b = { x: b2.x + Math.cos(angle + Math.PI + angleOff2) * b2.radius, y: b2.y + Math.sin(angle + Math.PI + angleOff2) * b2.radius };

                    ctx.beginPath();
                    ctx.moveTo(p1a.x, p1a.y);
                    ctx.quadraticCurveTo((b1.x + b2.x)/2, (b1.y + b2.y)/2, p2a.x, p2a.y);
                    ctx.lineTo(p2b.x, p2b.y);
                    ctx.quadraticCurveTo((b1.x + b2.x)/2, (b1.y + b2.y)/2, p1b.x, p1b.y);
                    ctx.fillStyle = `rgba(255, 255, 255, ${u * 0.25})`; // Whiter connection
                    ctx.fill();
                 }
            }

            const rSum = b1.radius + b2.radius;
            if (d < rSum * 0.5) { 
                const totalMass = b1.mass + b2.mass;
                const newArea = (Math.PI * b1.radius * b1.radius) + (Math.PI * b2.radius * b2.radius);
                const newRadius = Math.sqrt(newArea / Math.PI);
                
                b1.x = (b1.x * b1.mass + b2.x * b2.mass) / totalMass;
                b1.y = (b1.y * b1.mass + b2.y * b2.mass) / totalMass;
                b1.vx = (b1.vx * b1.mass + b2.vx * b2.mass) / totalMass;
                b1.vy = (b1.vy * b1.mass + b2.vy * b2.mass) / totalMass;
                b1.radius = Math.min(newRadius, 180); 
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

      // Interaction Check (Multi-hand)
      let hitHand = null;
      
      // If bubble is the Locked Target, check for collision with index tip
      if (lockedTarget.current && lockedTarget.current.id === b.id) {
          // Find the hand causing the lock
           for (const hand of handResults.current) {
              if (hand.gesture === GestureType.POINT) {
                  const indexTip = { x: hand.landmarks[INDEX_TIP].x * width, y: hand.landmarks[INDEX_TIP].y * height };
                  const d = Math.hypot(b.x - indexTip.x, b.y - indexTip.y);
                  if (d < b.radius + 15) { // Strict touch range for trigger
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
          b.stateTimer += 0.02; 
          if (b.stateTimer > 0.8) b.vy += GRAVITY * 4; 
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
        p.life -= 0.015;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        
        if (p.type === 'LIQUID' || p.type === 'SHARD') p.vy += GRAVITY * 3;
        else if (p.type === 'MIST') p.vy -= 0.05; 
        else if (p.type === 'SPARK') { p.vx *= 0.9; p.vy *= 0.9; }

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
            ctx.moveTo(0, -p.size);
            ctx.lineTo(p.size*0.6, p.size);
            ctx.lineTo(-p.size*0.6, p.size);
            ctx.fill();
        } else if (p.type === 'LIQUID') {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(0, 0, p.size, 0, Math.PI*2);
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
