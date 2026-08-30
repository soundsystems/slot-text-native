import { processColor } from "react-native";
import { Easing } from "react-native-reanimated";
import type {
  ChromaticOptions,
  NormalizedSlotOptions,
  SlotColor,
  SlotOptions,
  SlotTiming,
  TransitionPlan,
} from "./types";

export type { NormalizedSlotOptions } from "./types";

const EMPTY = "";

export const NBSP = "\u00A0";

export const glyph = (char: string) => (char === " " ? NBSP : char);

export const DEFAULT_SLOT_OPTIONS: Required<Omit<SlotOptions, "color">> = {
  align: "start",
  bounce: 0.6,
  colorFade: 280,
  direction: "down",
  duration: 300,
  easing: Easing.bezier(0.34, 1.56, 0.64, 1),
  exitOffset: 50,
  interrupt: true,
  skipUnchanged: true,
  stagger: 45,
};

/** Settle slack past the slowest glyph, so nothing snaps mid-overshoot. */
const SETTLE_TAIL_MS = 80;

export function normalizeOptions(
  options: SlotOptions = {}
): NormalizedSlotOptions {
  return {
    ...DEFAULT_SLOT_OPTIONS,
    ...options,
  };
}

/**
 * Reduced-motion collapses every duration to zero rather than disabling the
 * component: the machine still runs its full set/flash/queue lifecycle, so
 * `value`, `flash` reverts and queued rolls behave identically — the glyphs
 * just arrive instantly instead of rolling.
 */
export function withoutMotion(options: SlotOptions = {}): SlotOptions {
  return {
    ...options,
    bounce: 0,
    colorFade: 0,
    duration: 0,
    exitOffset: 0,
    stagger: 0,
  };
}

// Intl.Segmenter construction is expensive and splitGraphemes runs on every
// transition. One lazily-built segmenter is reused for the process.
let segmenter: Intl.Segmenter | null | undefined;

function getSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    segmenter =
      typeof Intl?.Segmenter === "function"
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;
  }

  return segmenter;
}

export function splitGraphemes(text: string): string[] {
  const instance = getSegmenter();

  if (instance) {
    return Array.from(instance.segment(text), ({ segment }) => segment);
  }

  // Hermes without full ICU: code points still beat code units, so surrogate
  // pairs survive even though ZWJ sequences split.
  return Array.from(text);
}

export function chromatic({
  from = 0,
  spread = 320,
  saturation = 92,
  lightness = 60,
}: ChromaticOptions = {}) {
  return (index: number, total: number) => {
    const t = total <= 1 ? 0 : index / (total - 1);
    // Comma syntax: the widest-compatible hsl() form across RN color parsers.
    return `hsl(${(from + t * spread) % 360}, ${saturation}%, ${lightness}%)`;
  };
}

export function resolveSlotColor(
  color: SlotColor | undefined,
  index: number,
  total: number
) {
  return typeof color === "function" ? color(index, total) : color;
}

export function shouldAnimateGlyph(
  fromChar: string,
  toChar: string,
  options: Pick<NormalizedSlotOptions, "skipUnchanged">
) {
  return !(
    fromChar === toChar &&
    (options.skipUnchanged || fromChar === EMPTY)
  );
}

export function wobble(index: number, salt: number) {
  const n = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43_758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

export function getGlyphTiming(
  index: number,
  toTextLength: number,
  toChar: string,
  options: Pick<NormalizedSlotOptions, "bounce" | "duration" | "stagger">
): SlotTiming {
  const isTail = toChar === EMPTY;
  const duration = Math.max(
    1,
    Math.round(
      options.duration *
        (isTail ? 0.75 : 1) *
        (1 + options.bounce * 0.45 * wobble(index, 1))
    )
  );
  const staggerIndex = isTail
    ? toTextLength * 0.5 + (index - toTextLength) * 0.25
    : index;
  const base = Math.max(
    0,
    Math.round(
      staggerIndex *
        options.stagger *
        (1 + options.bounce * 0.25 * wobble(index, 2))
    )
  );
  const tilt = Number((options.bounce * 5 * wobble(index, 3)).toFixed(2));

  return { base, duration, tilt };
}

export interface WidthTiming {
  delay: number;
  duration: number;
}

export function getWidthTiming(
  fromChar: string,
  toChar: string,
  timing: SlotTiming
): WidthTiming {
  if (toChar === EMPTY) {
    return {
      delay: timing.base + Math.round(timing.duration * 0.55),
      duration: Math.max(140, Math.round(timing.duration * 0.6)),
    };
  }

  if (fromChar === EMPTY) {
    return {
      delay: timing.base,
      duration: Math.max(140, Math.round(timing.duration * 0.45)),
    };
  }

  return {
    delay: timing.base,
    duration: timing.duration,
  };
}

/**
 * The single source of truth for a transition: grapheme split, per-glyph
 * timings and the settle total, computed once and shared by the state machine
 * (which needs `total`) and the renderer (which needs the per-glyph entries).
 * Deliberately size-free — glyph widths only scale the animation, they never
 * change its timing — so the machine can plan before measurement completes.
 */
export function buildTransitionPlan(
  fromText: string,
  toText: string,
  optionsInput: SlotOptions = {}
): TransitionPlan {
  const options = normalizeOptions(optionsInput);
  const rawFrom = splitGraphemes(fromText);
  const rawTo = splitGraphemes(toText);
  const maxLen = Math.max(rawFrom.length, rawTo.length);
  // End-aligned rolls pad the shorter side at the FRONT, so cell N always
  // holds the same place value: 99 -> 100 grows a new cell on the left and
  // leaves the ones column where it was, instead of shifting every digit.
  const pad = (chars: string[]) =>
    options.align === "end" && chars.length < maxLen
      ? [...new Array<string>(maxLen - chars.length).fill(EMPTY), ...chars]
      : chars;
  const fromChars = pad(rawFrom);
  const toChars = pad(rawTo);
  // Timing and colour index against the real glyphs, never the padding.
  const glyphTotal = rawTo.length;
  const entries: TransitionPlan["entries"] = [];
  let maxEnd = 0;
  let changed = false;

  for (let index = 0; index < maxLen; index += 1) {
    const fromChar = fromChars[index] ?? EMPTY;
    const toChar = toChars[index] ?? EMPTY;
    const animates =
      options.duration > 0 && shouldAnimateGlyph(fromChar, toChar, options);

    if (!animates) {
      entries.push({
        animates: false,
        colorDelay: 0,
        exitDelay: 0,
        fromChar,
        timing: { base: 0, duration: 1, tilt: 0 },
        tint: undefined,
        toChar,
        width: { delay: 0, duration: 1 },
      });

      if (fromChar !== toChar) {
        // A glyph swapped with duration 0 still counts as a change: the
        // machine must publish the new text even though nothing rolls.
        changed = true;
      }

      continue;
    }

    changed = true;
    const timing = getGlyphTiming(index, glyphTotal, toChar, options);
    const width = getWidthTiming(fromChar, toChar, timing);
    const exitDelay = timing.base + options.exitOffset;
    const colorDelay = exitDelay + timing.duration;

    entries.push({
      animates: true,
      colorDelay,
      exitDelay,
      fromChar,
      timing,
      tint: resolveSlotColor(options.color, index, glyphTotal),
      toChar,
      width,
    });

    maxEnd = Math.max(
      maxEnd,
      exitDelay + timing.duration + (options.color ? options.colorFade : 0)
    );

    if (fromChar === EMPTY || toChar === EMPTY) {
      maxEnd = Math.max(maxEnd, width.delay + width.duration);
    }
  }

  return {
    changed,
    entries,
    fromChars,
    maxLen,
    options,
    toChars,
    total: changed && maxEnd > 0 ? maxEnd + SETTLE_TAIL_MS : 0,
  };
}

export interface Rgba {
  a: number;
  b: number;
  g: number;
  r: number;
}

const OPAQUE_BLACK: Rgba = { a: 1, b: 0, g: 0, r: 0 };

/**
 * Parse a color to fixed RGBA channels ONCE on the JS thread. The alternative
 * — handing color strings to `interpolateColor` — re-parses both endpoints on
 * every frame for every glyph, which is thousands of regex executions per
 * second on the UI thread for a line of text.
 */
export function toRgba(color: string | undefined): Rgba | undefined {
  if (!color) {
    return;
  }

  const processed = processColor(color);

  if (typeof processed !== "number") {
    return;
  }

  // processColor packs ARGB into a signed 32-bit int. Unsigned shifts keep
  // Android's negative ints intact.
  // biome-ignore-start lint/suspicious/noBitwiseOperators: unpacking a packed ARGB integer
  return {
    a: ((processed >>> 24) & 0xff) / 255,
    b: (processed >>> 0) & 0xff,
    g: (processed >>> 8) & 0xff,
    r: (processed >>> 16) & 0xff,
  };
  // biome-ignore-end lint/suspicious/noBitwiseOperators: unpacking a packed ARGB integer
}

export function toRgbaOrBlack(color: string | undefined): Rgba {
  return toRgba(color) ?? OPAQUE_BLACK;
}
