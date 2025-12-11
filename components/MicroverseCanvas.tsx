import React, { useEffect, useRef, useState } from 'react';
import { getHandLandmarker, initializeVision } from '../services/vision';
import { Bubble, BubbleTheme, HandData, Particle, Vector2 } from '../types';
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

interface GestureState {
    isGun: boolean;
    x: number;
    y: number;
    tipCenter: Vector2; // The actual position of the fingers (for muzzle flash)
}

// Extended particle for different visual styles
interface ExtendedParticle extends Particle {
    type: 'LIQUID' | 'PIXEL' | 'SHARD' | 'SPARK';
    rotation: number;
    rotationSpeed: number;
}

const MicroverseCanvas: React.FC<MicroverseCanvasProps> = ({ mode, onExpandUniverse }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(0);
  const [isVisionLoaded, setIsVisionLoaded] = useState(false);
  const [fps, setFps] = useState(0);

  // Simulation State
  const bubbles = useRef<Bubble[]>([]);
  const particles = useRef<ExtendedParticle[]>([]);
  const lastTime = useRef<number>(0);
  const frameCount = useRef<number>(0);
  const spawnTimer = useRef<number>(0);
  const handResults = useRef<HandData[]>([]);
  
  // Interactive State
  const cursorSmooth = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const recoilOffset = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const isGestureActive = useRef<boolean>(false);
  const activeGunTip = useRef<Vector2 | null>(null);
  const lockedTargetId = useRef<string | null>(null);

  // Helpers
  const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;
  const dist = (p1: Vector2, p2: Vector2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

  const createBubble = (canvasWidth: number): Bubble => {
    const radius = randomRange(30, 80);
    const themes = Object.values(BubbleTheme);
    const theme = themes[Math.floor(Math.random() * themes.length)];
    
    return {
      id: Math.random().toString(36).substr(2, 9),
      x: randomRange(radius, canvasWidth - radius),
      y: -radius * 2,
      radius,
      vx: 0,
      vy: randomRange(0.8, 3.0),
      theme,
      hue: parseInt(THEME_COLORS[theme].main.split(',')[0]),
      phase: Math.random() * Math.PI * 2,
      wobble: 0,
      popping: false,
      popProgress: 0,
      contentSeed: Math.random(),
      mass: radius / 10,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: randomRange(-0.02, 0.02)
    };
  };

  const createExplosion = (b: Bubble) => {
    const count = 16;
    const color = THEME_COLORS[b.theme].inner[0];
    
    // Determine particle type based on theme
    let pType: ExtendedParticle['type'] = 'LIQUID';
    if (b.theme === BubbleTheme.CYBER || b.theme === BubbleTheme.QUANTUM) pType = 'PIXEL';
    if (b.theme === BubbleTheme.CRYSTAL) pType = 'SHARD';

    // Recoil effect on cursor
    recoilOffset.current = {
        x: (Math.random() - 0.5) * 15,
        y: (Math.random() - 0.5) * 15
    };

    // 1. Core Explosion
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomRange(2, 12);
      
      particles.current.push({
        id: Math.random().toString(),
        x: b.x + Math.cos(angle) * b.radius * 0.5,
        y: b.y + Math.sin(angle) * b.radius * 0.5,
        vx: Math.cos(angle) * speed + b.vx,
        vy: Math.sin(angle) * speed + b.vy,
        life: 1.0,
        color: i % 2 === 0 ? color : '#FFFFFF', 
        size: randomRange(5, 15),
        type: pType,
        rotation: Math.random() * Math.PI,
        rotationSpeed: randomRange(-0.2, 0.2)
      });
    }

    // 2. High-speed sparks (always present)
    for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = randomRange(10, 25);
        particles.current.push({
            id: Math.random().toString(),
            x: b.x,
            y: b.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.6,
            color: '#FFFFCC',
            size: randomRange(1, 3),
            type: 'SPARK',
            rotation: 0,
            rotationSpeed: 0
        });
    }
  };

  // --- Rendering Functions ---

  const drawBubbleContent = (ctx: CanvasRenderingContext2D, b: Bubble) => {
    ctx.save();
    
    // Lens Effect: Slight magnification for the content
    ctx.scale(1.1, 1.1); 
    
    ctx.rotate(b.rotation);
    ctx.beginPath();
    ctx.arc(0, 0, b.radius * 0.85, 0, Math.PI * 2);
    ctx.clip();

    const themeColors = THEME_COLORS[b.theme];
    
    if (b.theme === BubbleTheme.NEBULA) {
      const gradient = ctx.createRadialGradient(-10, -10, 0, 0, 0, b.radius);
      gradient.addColorStop(0, themeColors.inner[0]);
      gradient.addColorStop(0.5, themeColors.inner[1]);
      gradient.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = gradient;
      ctx.fill();
      
      ctx.fillStyle = 'white';
      for(let i=0; i<15; i++) {
        const sx = (Math.sin(b.contentSeed * i * 132) * b.radius * 0.7);
        const sy = (Math.cos(b.contentSeed * i * 23) * b.radius * 0.7);
        const size = Math.random() * 2;
        ctx.globalAlpha = 0.8 + Math.sin(b.phase * 5 + i) * 0.2;
        ctx.fillRect(sx, sy, size, size);
      }
    } else if (b.theme === BubbleTheme.FOREST) {
      ctx.strokeStyle = themeColors.inner[1];
      ctx.lineWidth = 2;
      for(let i=0; i<6; i++) {
        ctx.beginPath();
        const startX = (Math.sin(b.contentSeed + i) * b.radius * 0.5);
        ctx.moveTo(startX, b.radius);
        ctx.bezierCurveTo(startX + 10, 0, startX - (Math.sin(i + b.phase)*30), -b.radius * 0.5, startX, -b.radius * 0.8);
        ctx.stroke();
      }
    } else if (b.theme === BubbleTheme.CRYSTAL) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for(let i=0; i<6; i++) {
        const ang = (i / 6) * Math.PI * 2 + b.phase;
        ctx.lineTo(Math.cos(ang) * b.radius * 0.6, Math.sin(ang) * b.radius * 0.6);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fill();
    } else if (b.theme === BubbleTheme.QUANTUM) {
      ctx.strokeStyle = themeColors.inner[2];
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let t = 0; t < Math.PI * 2; t += 0.1) {
        const lx = Math.sin(5 * t + b.phase) * b.radius * 0.6;
        const ly = Math.sin(4 * t + b.phase * 0.5) * b.radius * 0.6;
        ctx.lineTo(lx, ly);
      }
      ctx.stroke();
    } else if (b.theme === BubbleTheme.CYBER) {
        ctx.strokeStyle = themeColors.inner[0];
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(-b.radius * 0.5, -b.radius * 0.5, b.radius, b.radius);
        
        ctx.fillStyle = themeColors.inner[1];
        if (Math.random() > 0.9) {
            ctx.fillRect(-b.radius * 0.8, -2, b.radius * 1.6, 4); // Glitch line
        }
        ctx.setLineDash([]);
    } else if (b.theme === BubbleTheme.ABSTRACT) {
        ctx.fillStyle = themeColors.inner[0];
        ctx.beginPath();
        const r = b.radius * 0.5;
        const offset = Math.sin(b.phase * 3) * 10;
        ctx.arc(offset, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = themeColors.inner[1];
        ctx.beginPath();
        ctx.arc(-offset, 0, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
  };

  const drawStarFlash = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, opacity: number) => {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = 'white';
    ctx.translate(x, y);
    
    // Core
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Rays
    ctx.beginPath();
    ctx.moveTo(-size, 0); ctx.lineTo(size, 0);
    ctx.moveTo(0, -size); ctx.lineTo(0, size);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = size * 0.1;
    ctx.stroke();

    // Secondary Rays (diagonal)
    ctx.beginPath();
    ctx.moveTo(-size * 0.6, -size * 0.6); ctx.lineTo(size * 0.6, size * 0.6);
    ctx.moveTo(size * 0.6, -size * 0.6); ctx.lineTo(-size * 0.6, size * 0.6);
    ctx.lineWidth = size * 0.05;
    ctx.stroke();

    ctx.restore();
  };

  const drawBubble = (ctx: CanvasRenderingContext2D, b: Bubble) => {
    ctx.save();
    ctx.translate(b.x, b.y);
    
    // Wobble effect
    const scaleX = 1 + Math.sin(b.phase * 3) * 0.05 + b.wobble;
    const scaleY = 1 - Math.sin(b.phase * 3) * 0.05 - b.wobble;
    ctx.scale(scaleX, scaleY);

    if (b.popping) {
        ctx.globalAlpha = 1 - b.popProgress;
        const t = b.popProgress;
        const popScale = t < 0.2 ? 1 - t * 2 : 0.6 + t * 4; 
        ctx.scale(popScale, popScale);
    }

    // 1. Inner Content (The Microverse)
    drawBubbleContent(ctx, b);

    // 2. Iridescent Shell (Thin film interference)
    // Create a gradient that mimics soap bubble oil-slick colors (Blue -> Purple -> Gold)
    const iridGrad = ctx.createRadialGradient(
      -b.radius * 0.2, -b.radius * 0.2, b.radius * 0.5,
      0, 0, b.radius
    );
    // Transparent center
    iridGrad.addColorStop(0, 'rgba(255, 255, 255, 0.01)');
    // Subtle inner blue tint
    iridGrad.addColorStop(0.75, 'rgba(100, 200, 255, 0.05)'); 
    // The Rainbow Ring (Interference pattern)
    iridGrad.addColorStop(0.82, 'rgba(60, 200, 255, 0.2)'); // Cyan/Blue
    iridGrad.addColorStop(0.88, 'rgba(200, 100, 255, 0.2)'); // Purple
    iridGrad.addColorStop(0.94, 'rgba(255, 100, 200, 0.25)'); // Pink
    iridGrad.addColorStop(0.98, 'rgba(255, 220, 100, 0.3)'); // Gold
    // Sharp Edge
    iridGrad.addColorStop(1, 'rgba(255, 255, 255, 0.5)'); 

    ctx.fillStyle = iridGrad;
    ctx.beginPath();
    ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
    ctx.fill();

    // 3. Rim Light (Edge Definition)
    ctx.strokeStyle = 'rgba(200, 240, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, b.radius - 1, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Specular Highlights & Stars
    
    // Main soft highlight (Window reflection)
    ctx.save();
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    // Distorted window shape
    ctx.beginPath();
    ctx.ellipse(0, -b.radius * 0.6, b.radius * 0.3, b.radius * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Sharp "Star" glints
    const glintOpacity = 0.8 + Math.sin(b.phase * 4) * 0.2;
    // Top-left glint
    drawStarFlash(ctx, -b.radius * 0.5, -b.radius * 0.5, b.radius * 0.15, glintOpacity);
    // Smaller bottom-right glint
    drawStarFlash(ctx, b.radius * 0.6, b.radius * 0.4, b.radius * 0.08, glintOpacity * 0.6);

    // Target Lock Highlight
    if (lockedTargetId.current === b.id) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, b.radius + 5, 0, Math.PI * 2);
        ctx.setLineDash([10, 15]);
        ctx.stroke();
    }

    ctx.restore();
  };

  const detectGesture = (hand: HandData, width: number, height: number): GestureState => {
    const l = hand.landmarks;
    
    // Transform coordinates (Mirror X)
    const getPoint = (idx: number) => ({ x: (1 - l[idx].x) * width, y: l[idx].y * height });
    const getNormPoint = (idx: number) => ({ x: (1 - l[idx].x), y: l[idx].y });

    // Distance in normalized space
    const dNorm = (i1: number, i2: number) => dist(getNormPoint(i1), getNormPoint(i2));

    const wrist = getNormPoint(WRIST);

    // Check Extension (Tip further from wrist than MCP)
    const isIndexExtended = dNorm(INDEX_TIP, WRIST) > dNorm(INDEX_MCP, WRIST) * 1.1;
    const isMiddleExtended = dNorm(MIDDLE_TIP, WRIST) > dNorm(MIDDLE_MCP, WRIST) * 1.1;
    
    const isRingCurled = dNorm(RING_TIP, WRIST) < dNorm(RING_MCP, WRIST) * 1.2; 
    const isPinkyCurled = dNorm(PINKY_TIP, WRIST) < dNorm(PINKY_MCP, WRIST) * 1.2;
    const isThumbCurled = dNorm(THUMB_TIP, INDEX_MCP) < 0.2; // Thumb close to index base

    // Gun Gesture: Index & Middle Extended, others curled
    const isGun = isIndexExtended && isMiddleExtended && isRingCurled && isPinkyCurled && isThumbCurled;

    if (isGun) {
        const tip1 = getPoint(INDEX_TIP);
        const tip2 = getPoint(MIDDLE_TIP);
        const mcp1 = getPoint(INDEX_MCP);
        
        // Calculate the center of the two fingertips
        const tipCenter = { x: (tip1.x + tip2.x) / 2, y: (tip1.y + tip2.y) / 2 };
        
        // Project direction from knuckle (MCP) to Tip to find aiming point
        const vector = { x: tipCenter.x - mcp1.x, y: tipCenter.y - mcp1.y };
        const magnitude = Math.hypot(vector.x, vector.y);
        
        // Extend vector to find target on screen
        const projectionScale = 12.0; // How far to project
        
        return {
            isGun: true,
            x: tipCenter.x + (vector.x / magnitude) * magnitude * projectionScale,
            y: tipCenter.y + (vector.y / magnitude) * magnitude * projectionScale,
            tipCenter
        };
    }

    return { isGun: false, x: 0, y: 0, tipCenter: {x:0, y:0} };
  };

  const drawGunVisuals = (ctx: CanvasRenderingContext2D, gunTip: Vector2, reticle: Vector2, isLocked: boolean) => {
    // 1. Laser Sight
    ctx.save();
    const grad = ctx.createLinearGradient(gunTip.x, gunTip.y, reticle.x, reticle.y);
    grad.addColorStop(0, 'rgba(0, 255, 200, 0)');
    grad.addColorStop(0.2, 'rgba(0, 255, 200, 0.4)');
    grad.addColorStop(1, 'rgba(0, 255, 200, 0.1)');
    
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gunTip.x, gunTip.y);
    ctx.lineTo(reticle.x, reticle.y);
    ctx.stroke();
    ctx.restore();

    // 2. Muzzle Flash (Energy Orb)
    ctx.save();
    ctx.translate(gunTip.x, gunTip.y);
    const pulse = 1 + Math.sin(frameCount.current * 0.2) * 0.2;
    
    // Core
    ctx.fillStyle = '#00FFCC';
    ctx.shadowColor = '#00FFCC';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(0, 0, 6 * pulse, 0, Math.PI * 2);
    ctx.fill();
    
    // Rings
    ctx.strokeStyle = 'rgba(0, 255, 200, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 12 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();

    // 3. Reticle
    ctx.save();
    ctx.translate(reticle.x, reticle.y);
    
    // Recoil offset application
    ctx.translate(recoilOffset.current.x, recoilOffset.current.y);

    const color = isLocked ? '#FF3366' : '#00FFCC';
    const size = isLocked ? 25 : 35;
    const rotateSpeed = isLocked ? 0.2 : 0.05;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = isLocked ? 15 : 5;

    // Center dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, isLocked ? 4 : 2, 0, Math.PI * 2);
    ctx.fill();

    // Animated Circle
    ctx.rotate(frameCount.current * rotateSpeed);
    
    // Tech Brackets
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 0.5);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(0, 0, size, Math.PI, Math.PI * 1.5);
    ctx.stroke();

    if (isLocked) {
        ctx.beginPath();
        ctx.moveTo(-size * 1.5, 0); ctx.lineTo(-size * 0.5, 0);
        ctx.moveTo(size * 1.5, 0); ctx.lineTo(size * 0.5, 0);
        ctx.moveTo(0, -size * 1.5); ctx.lineTo(0, -size * 0.5);
        ctx.moveTo(0, size * 1.5); ctx.lineTo(0, size * 0.5);
        ctx.stroke();
    }

    ctx.restore();
  };

  // --- Physics Loop ---

  const update = (time: number) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;

    const delta = Math.min((time - lastTime.current) / 1000, 0.1);
    lastTime.current = time;

    // Background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    // 1. Process Hands (Mirrored logic handled in detectGesture)
    const handLandmarker = getHandLandmarker();
    if (handLandmarker && videoRef.current && videoRef.current.readyState >= 2) {
       const detections = handLandmarker.detectForVideo(videoRef.current, performance.now());
       handResults.current = detections.landmarks.map((landmarks, i) => ({
         landmarks,
         worldLandmarks: detections.worldLandmarks[i],
         handedness: detections.handedness[i][0].categoryName as 'Left' | 'Right'
       }));
    }

    // 2. Gesture Logic
    let gunX = 0;
    let gunY = 0;
    let gunActive = false;
    let tipPosition: Vector2 | null = null;

    handResults.current.forEach(hand => {
        const gesture = detectGesture(hand, width, height);
        if (gesture.isGun) {
            gunActive = true;
            gunX = gesture.x;
            gunY = gesture.y;
            tipPosition = gesture.tipCenter;
        }
    });

    // Smooth Cursor
    if (gunActive) {
        cursorSmooth.current.x += (gunX - cursorSmooth.current.x) * 0.2;
        cursorSmooth.current.y += (gunY - cursorSmooth.current.y) * 0.2;
        isGestureActive.current = true;
        activeGunTip.current = tipPosition;
    } else {
        isGestureActive.current = false;
        activeGunTip.current = null;
    }

    // Dampen Recoil
    recoilOffset.current.x *= 0.8;
    recoilOffset.current.y *= 0.8;

    // Draw Hands (Simple wireframe, Mirrored)
    handResults.current.forEach(hand => {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.fillStyle = 'rgba(100, 200, 255, 0.1)';
        
        for (const lm of hand.landmarks) {
            const lx = (1 - lm.x) * width; // Mirror X
            const ly = lm.y * height;
            ctx.beginPath();
            ctx.arc(lx, ly, 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    });

    // 3. Spawn Bubbles
    spawnTimer.current++;
    if (spawnTimer.current > BUBBLE_SPAWN_RATE && bubbles.current.length < MAX_BUBBLES) {
      bubbles.current.push(createBubble(width));
      spawnTimer.current = 0;
    }

    // 4. Update & Draw Bubbles
    let lockedBubble = null;

    for (let i = bubbles.current.length - 1; i >= 0; i--) {
      const b = bubbles.current[i];

      if (b.popping) {
        b.popProgress += delta * 5; // Fast pop
        if (b.popProgress >= 1) {
          createExplosion(b);
          onExpandUniverse(b.theme);
          bubbles.current.splice(i, 1);
          continue;
        }
      } else {
        b.vy += GRAVITY;
        b.vx *= AIR_RESISTANCE;
        b.vy *= AIR_RESISTANCE;
        b.x += b.vx;
        b.y += b.vy;
        b.phase += delta;
        b.rotation += b.rotationSpeed;
        b.wobble *= 0.9;

        // Interaction: Gun Logic
        if (isGestureActive.current) {
             const distToReticle = Math.hypot(b.x - cursorSmooth.current.x, b.y - cursorSmooth.current.y);
             // Lock on range
             if (distToReticle < b.radius * 1.5) {
                 lockedBubble = b.id;
                 // "Magnetic" assist for reticle
                 cursorSmooth.current.x += (b.x - cursorSmooth.current.x) * 0.1;
                 cursorSmooth.current.y += (b.y - cursorSmooth.current.y) * 0.1;

                 // Check for "Fire" (Trigger) - For now we use proximity as trigger for simplicity, 
                 // or we could add a thumb gesture. Let's keep proximity but with a tighter threshold.
                 if (distToReticle < b.radius * 0.8) {
                     b.popping = true;
                     b.wobble = 0.5;
                 }
             }
        }
        
        // Interaction: Bounce with body of hands
        handResults.current.forEach(hand => {
             hand.landmarks.forEach((lm, idx) => {
                if ([WRIST, INDEX_MCP, PINKY_MCP].includes(idx)) {
                    const lx = (1 - lm.x) * width;
                    const ly = lm.y * height;
                    const d = Math.hypot(b.x - lx, b.y - ly);
                    if (d < b.radius + 15) {
                        const nx = (b.x - lx) / d;
                        const ny = (b.y - ly) / d;
                        b.vx += nx * 0.8;
                        b.vy += ny * 0.8;
                        b.wobble = 0.3;
                    }
                }
             });
        });

        if (b.y > height + b.radius * 2) {
           bubbles.current.splice(i, 1);
           continue;
        }
      }
      drawBubble(ctx, b);
    }
    
    lockedTargetId.current = lockedBubble;

    // Draw Gun Visuals (On top of bubbles, below particles)
    if (isGestureActive.current && activeGunTip.current) {
        drawGunVisuals(ctx, activeGunTip.current, cursorSmooth.current, !!lockedBubble);
    }

    // 5. Metaball & Particle Effects
    // Group particles by rendering technique
    const liquidParticles: ExtendedParticle[] = [];
    const solidParticles: ExtendedParticle[] = [];

    for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i];
        p.life -= delta * 1.2;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.vy += GRAVITY * 0.1;

        if (p.life <= 0) {
            particles.current.splice(i, 1);
            continue;
        }
        if (p.type === 'LIQUID') liquidParticles.push(p);
        else solidParticles.push(p);
    }

    // Render Liquid (Metaballs) - Requires Filter
    if (liquidParticles.length > 0) {
        ctx.save();
        // The magic metaball filter: Blur it, then boost contrast to sharpen edges
        ctx.filter = 'blur(10px) contrast(15)'; 
        for (const p of liquidParticles) {
            ctx.fillStyle = p.color; 
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    // Render Solid/Pixel/Sparks
    ctx.save();
    for (const p of solidParticles) {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;

        if (p.type === 'PIXEL') {
            const size = p.size * 1.5;
            ctx.fillRect(p.x - size/2, p.y - size/2, size, size);
        } else if (p.type === 'SHARD') {
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.beginPath();
            ctx.moveTo(0, -p.size);
            ctx.lineTo(p.size * 0.5, p.size);
            ctx.lineTo(-p.size * 0.5, p.size);
            ctx.fill();
            ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        } else {
             // Spark
             ctx.beginPath();
             ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
             ctx.fill();
        }
    }
    ctx.restore();

    // FPS
    if (frameCount.current % 30 === 0) {
      setFps(Math.round(1 / delta));
    }
    frameCount.current++;
    requestRef.current = requestAnimationFrame(update);
  };

  useEffect(() => {
    const init = async () => {
      try {
        await initializeVision();
        setIsVisionLoaded(true);
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
      if (videoRef.current && videoRef.current.srcObject) {
         const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
         tracks.forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-black">
        <video 
            ref={videoRef} 
            className="absolute top-0 left-0 w-full h-full object-cover opacity-0 pointer-events-none"
            style={{ transform: 'scaleX(-1)' }} // Local mirror for debug if we made it visible
            playsInline
            muted
        />
        <canvas ref={canvasRef} className="block w-full h-full" />

        {!isVisionLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black text-white z-50">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-lg font-light tracking-widest uppercase">Initializing Sensors...</p>
                </div>
            </div>
        )}
        <div className="absolute bottom-4 left-4 text-xs text-gray-600 font-mono">
           FPS: {fps} | BUBBLES: {bubbles.current.length}
        </div>
    </div>
  );
};

export default MicroverseCanvas;