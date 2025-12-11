
export enum BubbleTheme {
  NEBULA = 'NEBULA',
  FOREST = 'FOREST',
  CRYSTAL = 'CRYSTAL',
  ABSTRACT = 'ABSTRACT',
  QUANTUM = 'QUANTUM',
  CYBER = 'CYBER'
}

export enum BubbleElement {
  WATER = 'WATER', // Melts/Drips
  FIRE = 'FIRE',   // Evaporates/Gas
  NEBULA = 'NEBULA', // Evaporates/Gas
  METAL = 'METAL', // Freezes/Shatters
  ICE = 'ICE'      // Freezes/Shatters
}

export enum BubbleState {
  FLOATING = 'FLOATING',
  GROWING = 'GROWING',      // Being blown by hand
  MERGING = 'MERGING',      // Being attracted to another bubble
  FROZEN = 'FROZEN',        // Ice effect: Heavy, falling, rigid
  MELTING = 'MELTING',      // Transition to water droplets
  EVAPORATING = 'EVAPORATING', // Transition to gas
  SHATTERED = 'SHATTERED',  // Broken on floor
  POPPING = 'POPPING'
}

export enum GestureType {
  NONE = 'NONE',
  POINT = 'POINT',         // Index finger only (Trigger Element)
  OPEN_HAND = 'OPEN_HAND', // All fingers out (Wind/Trail)
  PINCH = 'PINCH',         // Index + Thumb (Blow bubble)
  FIST = 'FIST'            // Closed hand
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0.0 to 1.0
  color: string;
  size: number;
}

export interface Bubble {
  id: string;
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  theme: BubbleTheme;
  element: BubbleElement;
  hue: number;
  phase: number;
  wobble: number;
  state: BubbleState;
  stateTimer: number;
  contentSeed: number;
  mass: number;
  rotation: number;
  rotationSpeed: number;
  creationTime: number; // Timestamp for spawn protection
}

export interface HandData {
  landmarks: Vector2[]; // Normalized 0-1
  worldLandmarks: { x: number; y: number; z: number }[];
  handedness: 'Left' | 'Right';
  gesture: GestureType;
  pinchStrength: number; // 0-1
  center: Vector2;
  velocity: Vector2; // Hand movement speed
}

export interface AppMode {
  id: 'MEDITATION' | 'LAB' | 'ARTIST';
  name: string;
  description: string;
}
