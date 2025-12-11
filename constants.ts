
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

// High-Key Colors: Lightness boosted to >80% for "glowing" effect on black
export const THEME_COLORS: Record<BubbleTheme, { main: string; glow: string; inner: string[] }> = {
  [BubbleTheme.NEBULA]: {
    main: '260, 100%, 88%', 
    glow: 'rgba(180, 100, 255, 0.8)',
    inner: ['#FFCCFF', '#8888FF', '#AAFFFF']
  },
  [BubbleTheme.FOREST]: {
    main: '140, 95%, 85%',
    glow: 'rgba(100, 255, 150, 0.7)',
    inner: ['#CCFFCC', '#88FFAA', '#EEFFCC']
  },
  [BubbleTheme.CRYSTAL]: {
    main: '190, 100%, 92%',
    glow: 'rgba(150, 230, 255, 0.9)',
    inner: ['#FFFFFF', '#DDEEFF', '#E0F7FA']
  },
  [BubbleTheme.ABSTRACT]: {
    main: '330, 100%, 88%',
    glow: 'rgba(255, 50, 150, 0.8)',
    inner: ['#FFAA88', '#FFFFAA', '#FF88BB']
  },
  [BubbleTheme.QUANTUM]: {
    main: '180, 100%, 90%',
    glow: 'rgba(100, 255, 255, 0.9)',
    inner: ['#CCFFFF', '#FFFFFF', '#AAFFE0']
  },
  [BubbleTheme.CYBER]: {
    main: '290, 100%, 88%',
    glow: 'rgba(255, 80, 255, 0.8)',
    inner: ['#FFCCFF', '#CCFF00', '#FFFFFF']
  }
};

export const ELEMENT_COLORS: Record<BubbleElement, string[]> = {
    [BubbleElement.WATER]: ['#CCFFFF', '#66BBFF', '#FFFFFF'],
    [BubbleElement.FIRE]: ['#FFCC00', '#FF6600', '#FFFFFF'],
    [BubbleElement.NEBULA]: ['#FF88FF', '#CC88FF', '#EEEEFF'],
    [BubbleElement.METAL]: ['#FFFFFF', '#CCCCCC', '#AAAAAA'],
    [BubbleElement.ICE]: ['#FFFFFF', '#DDF0FF', '#BBE0FF']
};
