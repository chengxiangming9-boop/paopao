
import { BubbleTheme, BubbleElement } from "./types";

export const GRAVITY = 0.03; 
export const AIR_RESISTANCE = 0.99; // Restored original drag
export const BUBBLE_SPAWN_RATE = 50;
export const MAX_BUBBLES = 35; // Restored original limit
export const INTERACTION_RADIUS_MULTIPLIER = 1.2;

// Interaction Thresholds
export const VELOCITY_SWIPE_THRESHOLD = 20; 
export const VELOCITY_SYMBIOSIS_THRESHOLD = 5; 
export const SYMBIOSIS_ATTACH_DIST = 40;

// MediaPipe Hands Landmark Indices
export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5;
export const INDEX_TIP = 8;
export const MIDDLE_MCP = 9;
export const MIDDLE_TIP = 12;
export const RING_MCP = 13;
export const RING_TIP = 16;
export const PINKY_MCP = 17;
export const PINKY_TIP = 20;

// Premium Colors: High saturation neon-glass aesthetic against black background.
export const THEME_COLORS: Record<BubbleTheme, { main: string; glow: string; inner: string[] }> = {
  [BubbleTheme.NEBULA]: {
    main: '265, 100%, 75%', // Bright Violet
    glow: 'rgba(180, 80, 255, 0.7)',
    inner: ['#E0B0FF', '#9966FF', '#4B0082']
  },
  [BubbleTheme.FOREST]: {
    main: '150, 100%, 65%', // Neon Green
    glow: 'rgba(50, 255, 150, 0.6)',
    inner: ['#AAFFDD', '#00FF99', '#004400']
  },
  [BubbleTheme.CRYSTAL]: {
    main: '195, 100%, 75%', // Cyan-Blue
    glow: 'rgba(100, 240, 255, 0.7)',
    inner: ['#FFFFFF', '#BBEEFF', '#0077BE']
  },
  [BubbleTheme.ABSTRACT]: {
    main: '330, 100%, 70%', // Hot Pink
    glow: 'rgba(255, 20, 147, 0.7)',
    inner: ['#FFC0CB', '#FF1493', '#8B008B']
  },
  [BubbleTheme.QUANTUM]: {
    main: '175, 100%, 65%', // Aqua
    glow: 'rgba(0, 255, 220, 0.7)',
    inner: ['#E0FFFF', '#00FA9A', '#008080']
  },
  [BubbleTheme.CYBER]: {
    main: '290, 100%, 70%', // Magenta
    glow: 'rgba(255, 50, 255, 0.7)',
    inner: ['#FFCCFF', '#FF00FF', '#800080']
  }
};

export const ELEMENT_COLORS: Record<BubbleElement, string[]> = {
    [BubbleElement.WATER]: ['#CCFFFF', '#66BBFF', '#FFFFFF'],
    [BubbleElement.FIRE]: ['#FFCC00', '#FF6600', '#FFFFFF'],
    [BubbleElement.NEBULA]: ['#FF88FF', '#CC88FF', '#EEEEFF'],
    [BubbleElement.METAL]: ['#FFFFFF', '#CCCCCC', '#AAAAAA'],
    [BubbleElement.ICE]: ['#FFFFFF', '#DDF0FF', '#BBE0FF']
};
