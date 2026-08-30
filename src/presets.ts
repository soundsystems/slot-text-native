import type { SlotOptions } from "./types";
import { chromatic } from "./utils";

/**
 * Curated option sets for common jobs. Spread one and override what you need:
 *
 * ```tsx
 * <SlotText text={label} options={{ ...presets.snappy, direction: "up" }} />
 * ```
 *
 * Each preset is a plain `SlotOptions` object — nothing here is required, and
 * omitting a preset entirely gives the library default (a springy 300ms roll).
 */
// biome-ignore assist/source/useSortedKeys: ordered subtle -> showpiece, which is how they read
export const presets = {
  /**
   * Quick, tight roll for interface labels that change alongside other UI —
   * sort controls, tab titles, button text. Fast enough to read as feedback
   * rather than a performance.
   */
  snappy: {
    bounce: 0.45,
    duration: 260,
    exitOffset: 40,
    stagger: 32,
  },

  /**
   * Barely-there motion for dense or serious surfaces: minimal bounce, a short
   * wave, unchanged glyphs held still. The text updates read as content
   * changing, not as an animation playing.
   */
  calm: {
    bounce: 0.15,
    duration: 210,
    exitOffset: 24,
    skipUnchanged: true,
    stagger: 14,
  },

  /**
   * Digit-friendly roll for numbers rendered through plain `SlotText` —
   * end-aligned so the ones column never moves when the number grows. Reach
   * for `SlotCounter` first; this exists for pre-formatted strings it can't
   * express.
   */
  odometer: {
    align: "end",
    bounce: 0.25,
    duration: 240,
    exitOffset: 36,
    stagger: 24,
  },

  /**
   * The showpiece: a slow, wide wave with heavy per-letter wobble and a
   * chromatic sweep that fades as each glyph lands. For celebratory moments —
   * totals, wins, reveals — not for labels that change often.
   */
  jackpot: {
    bounce: 0.85,
    color: chromatic(),
    colorFade: 420,
    duration: 420,
    exitOffset: 70,
    skipUnchanged: false,
    stagger: 60,
  },
} as const satisfies Record<string, SlotOptions>;

export type SlotPresetName = keyof typeof presets;
