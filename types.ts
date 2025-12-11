export enum BubbleTheme {
  NEBULA = 'NEBULA',
  FOREST = 'FOREST',
  CRYSTAL = 'CRYSTAL',
  ABSTRACT = 'ABSTRACT',
  QUANTUM = 'QUANTUM',
  CYBER = 'CYBER'
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
  hue: number;
  phase: number; // For animation pulsing
  wobble: number;
  popping: boolean;
  popProgress: number;
  contentSeed: number; // Random seed for inner drawing
  mass: number;
  rotation: number; // Angular position
  rotationSpeed: number;
}

export interface HandData {
  landmarks: Vector2[]; // Normalized 0-1
  worldLandmarks: { x: number; y: number; z: number }[];
  handedness: 'Left' | 'Right';
}

export interface AppMode {
  id: 'MEDITATION' | 'LAB' | 'ARTIST';
  name: string;
  description: string;
}