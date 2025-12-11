
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

export const THEME_COLORS: Record<BubbleTheme, { main: string; glow: string; inner: string[] }> = {
  [BubbleTheme.NEBULA]: {
    main: '260, 100%, 70%',
    glow: 'rgba(150, 0, 255, 0.4)',
    inner: ['#FF00CC', '#3300FF', '#00FFFF']
  },
  [BubbleTheme.FOREST]: {
    main: '120, 80%, 60%',
    glow: 'rgba(0, 255, 100, 0.3)',
    inner: ['#00FF00', '#004400', '#AAFF00']
  },
  [BubbleTheme.CRYSTAL]: {
    main: '200, 90%, 80%',
    glow: 'rgba(0, 200, 255, 0.5)',
    inner: ['#FFFFFF', '#AACCFF', '#E0F7FA']
  },
  [BubbleTheme.ABSTRACT]: {
    main: '320, 90%, 60%',
    glow: 'rgba(255, 0, 100, 0.4)',
    inner: ['#FF5500', '#FFFF00', '#FF0055']
  },
  [BubbleTheme.QUANTUM]: {
    main: '180, 100%, 50%',
    glow: 'rgba(0, 255, 255, 0.6)',
    inner: ['#000000', '#FFFFFF', '#00FFCC']
  },
  [BubbleTheme.CYBER]: {
    main: '300, 100%, 50%',
    glow: 'rgba(255, 0, 255, 0.8)',
    inner: ['#FF00FF', '#00FF00', '#FFFF00']
  }
};

export const ELEMENT_COLORS: Record<BubbleElement, string[]> = {
    [BubbleElement.WATER]: ['#00FFFF', '#0077FF', '#FFFFFF'],
    [BubbleElement.FIRE]: ['#FF3300', '#FFCC00', '#440000'],
    [BubbleElement.NEBULA]: ['#FF00FF', '#9900FF', '#000066'],
    [BubbleElement.METAL]: ['#E0E0E0', '#999999', '#FFFFFF'],
    [BubbleElement.ICE]: ['#E0F7FA', '#B2EBF2', '#FFFFFF']
};