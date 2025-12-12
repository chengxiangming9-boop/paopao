
import { BubbleTheme, BubbleElement } from "./types";

export const GRAVITY = 0.05;
export const AIR_RESISTANCE = 0.98;
export const BUBBLE_SPAWN_RATE = 50;
export const MAX_BUBBLES = 35;
export const INTERACTION_RADIUS_MULTIPLIER = 1.2;

// Interaction Thresholds
export const VELOCITY_SWIPE_THRESHOLD = 20; // Pixels per frame
export const VELOCITY_SYMBIOSIS_THRESHOLD = 5; // Pixels per frame
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

// Premium Colors: Rich saturation, Medium Lightness (50-60%) to allow highlights to pop.
// Not "White with a tint", but "Deep Colored Glass".
export const THEME_COLORS: Record<BubbleTheme, { main: string; glow: string; inner: string[] }> = {
  [BubbleTheme.NEBULA]: {
    main: '260, 80%, 65%', 
    glow: 'rgba(160, 80, 255, 0.5)',
    inner: ['#E0B0FF', '#9966FF', '#5500AA']
  },
  [BubbleTheme.FOREST]: {
    main: '150, 90%, 45%', // Deeper green
    glow: 'rgba(50, 255, 120, 0.4)',
    inner: ['#88FFCC', '#00CC66', '#004422']
  },
  [BubbleTheme.CRYSTAL]: {
    main: '200, 85%, 60%',
    glow: 'rgba(100, 220, 255, 0.5)',
    inner: ['#FFFFFF', '#AACCFF', '#0077BE']
  },
  [BubbleTheme.ABSTRACT]: {
    main: '340, 90%, 60%',
    glow: 'rgba(255, 50, 100, 0.5)',
    inner: ['#FF99AA', '#FF4466', '#880022']
  },
  [BubbleTheme.QUANTUM]: {
    main: '180, 100%, 50%', // Cyan needs to be darker to show white highlights
    glow: 'rgba(0, 255, 240, 0.4)',
    inner: ['#AAFFFF', '#00DDCC', '#005544']
  },
  [BubbleTheme.CYBER]: {
    main: '290, 95%, 55%',
    glow: 'rgba(240, 50, 240, 0.5)',
    inner: ['#FFBBFF', '#CC00CC', '#550055']
  }
};

export const ELEMENT_COLORS: Record<BubbleElement, string[]> = {
    [BubbleElement.WATER]: ['#CCFFFF', '#66BBFF', '#FFFFFF'],
    [BubbleElement.FIRE]: ['#FFCC00', '#FF6600', '#FFFFFF'],
    [BubbleElement.NEBULA]: ['#FF88FF', '#CC88FF', '#EEEEFF'],
    [BubbleElement.METAL]: ['#FFFFFF', '#CCCCCC', '#AAAAAA'],
    [BubbleElement.ICE]: ['#FFFFFF', '#DDF0FF', '#BBE0FF']
};
