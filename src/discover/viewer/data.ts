/**
 * The robots this build shows (WP-D2): the cleared hall robots, plus the amber exhibits only under
 * SHOW_AMBER (src/core/release.ts). The constant folds at build time, so a build without VITE_AMBER=1
 * drops AMBER_ROBOTS — and the amber line with them — from the bundle. A small chunk of its own:
 * install.ts imports it while the game boots, the studio chunk statically.
 */
import { SHOW_AMBER } from '@/core/release';
import { AMBER_ROBOTS, ROBOTS, VIEWER_TEXT } from '../data/robots.gen';
import type { GenRobot, HallCategory } from './types';

export const TEXT = VIEWER_TEXT;

/** in the hall's order: GEHEN, GREIFEN & FAHREN, SELBST BAUEN */
export const HALL: readonly GenRobot[] = SHOW_AMBER ? [...ROBOTS, ...AMBER_ROBOTS].sort((a, b) => a.order - b.order) : ROBOTS;

export const CATEGORIES: readonly HallCategory[] = ['gehen', 'greifen', 'bauen'];
