import type { Ref, RefObject } from "react";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import type {
  EasingFunction,
  EasingFunctionFactory,
} from "react-native-reanimated";

export type SlotDirection = "up" | "down";

export type SlotColor = string | ((index: number, total: number) => string);

/**
 * Which end of the two strings holds still while the other end grows or
 * shrinks. "start" keeps the first character in cell 0 (Copy -> Copied);
 * "end" keeps the last character in the last cell (99 -> 100), which is what
 * a counter needs so the ones column never moves.
 */
export type SlotAlign = "end" | "start";

export interface SlotOptions {
  /** Which end stays put when the two strings differ in length. */
  align?: SlotAlign;
  /** Per-letter variation in speed and tilt. */
  bounce?: number;
  /** Incoming glyph tint, or a per-character color factory. */
  color?: SlotColor;
  /** How long the tint takes to fade back to rest, in ms. */
  colorFade?: number;
  /** "down" rolls glyphs downward (enter from top); "up" rolls upward. */
  direction?: SlotDirection;
  /** Slide duration per character in ms. */
  duration?: number;
  /**
   * Reanimated easing. Defaults to a springy bezier. Custom functions run on
   * the UI thread, so a plain function must be a worklet.
   */
  easing?: EasingFunction | EasingFunctionFactory;
  /** How long the incoming glyph trails the outgoing one, in ms. */
  exitOffset?: number;
  /** Interrupt a running roll, or queue the latest call until it finishes. */
  interrupt?: boolean;
  /** Keep characters that are identical at the same index static. */
  skipUnchanged?: boolean;
  /** Per-character stagger in ms. */
  stagger?: number;
}

export type NormalizedSlotOptions = Required<Omit<SlotOptions, "color">> & {
  color?: SlotColor;
};

export interface ChromaticOptions {
  from?: number;
  lightness?: number;
  saturation?: number;
  spread?: number;
}

export interface FlashOptions {
  /** Roll options for the flash text rolling in. */
  enter?: SlotOptions;
  /** Roll options for the original text rolling back. */
  exit?: SlotOptions;
  /** How long the flash text stays before rolling back, in ms. */
  revertAfter?: number;
}

export interface SlotTiming {
  /** Stagger offset before this glyph starts moving, in ms. */
  base: number;
  /** Slide duration for this glyph, in ms. */
  duration: number;
  /** Settle tilt in degrees. */
  tilt: number;
}

export interface TransitionPlanEntry {
  /** False for glyphs held static (unchanged, or a zero-duration roll). */
  animates: boolean;
  /** When the tint starts fading back to rest, in ms. */
  colorDelay: number;
  /** When the incoming glyph starts, in ms (the outgoing one starts at base). */
  exitDelay: number;
  fromChar: string;
  timing: SlotTiming;
  tint: string | undefined;
  toChar: string;
  width: { delay: number; duration: number };
}

export interface TransitionPlan {
  /** True when at least one glyph differs, i.e. there is something to show. */
  changed: boolean;
  entries: TransitionPlanEntry[];
  fromChars: string[];
  maxLen: number;
  options: NormalizedSlotOptions;
  toChars: string[];
  /** Wall-clock ms from first frame to fully settled. */
  total: number;
}

export interface SlotTextController {
  /** Cancel timers and leave the current value rendered statically. */
  destroy: () => void;
  /**
   * Roll to temporary text, then roll back automatically.
   * Repeated flashes restart the revert timer instead of queueing extra rolls.
   */
  flash: (text: string, options?: FlashOptions) => void;
  /** Roll to new text. Cancels any pending flash revert. */
  set: (text: string, options?: SlotOptions) => void;
  /** The text currently targeted by the component. */
  readonly value: string;
}

export type SlotTextControllerRef = RefObject<SlotTextController | null>;

/**
 * How the label lays out when nothing is rolling.
 *
 * - "text" (default): one plain `<Text>`. Cheapest at rest and keeps native
 *   kerning, but the row re-flows to per-glyph cells when a roll starts, so a
 *   kerning-heavy font shifts slightly at the start and end of each roll.
 * - "slots": the per-glyph cells stay mounted. Matches the web library exactly
 *   — no re-flow, and repeat rolls reuse the mounted views instead of
 *   remounting them — at the cost of one view per character at rest, and
 *   kerning is lost permanently. Prefer it for labels that animate often
 *   (counters, live values) and "text" for labels that rarely change.
 */
export type SlotRestLayout = "slots" | "text";

export interface SlotCounterProps
  extends Omit<SlotTextProps, "text" | "options"> {
  /**
   * Custom formatter. Overrides every Intl option below, so use it for
   * currency, compact notation, units or anything Intl cannot express.
   */
  format?: (value: number) => string;
  /** BCP 47 locale for the built-in formatter. Defaults to the device's. */
  locale?: string | string[];
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  /**
   * Roll options. `align` defaults to "end" and `direction` follows whether
   * the value rose or fell; both are overridable here.
   */
  options?: SlotOptions;
  /** Rendered ahead of the number and measured with it, e.g. "$". */
  prefix?: string;
  /** Rendered after the number and measured with it, e.g. "%". */
  suffix?: string;
  /**
   * Apply `fontVariant: ["tabular-nums"]` so every digit cell is the same
   * width and digits swap without any width animation. Default true.
   */
  tabularNums?: boolean;
  /** Group thousands using the locale's separator. Default true. */
  useGrouping?: boolean;
  /** The number to display. A change rolls to it. */
  value: number;
}

export interface SlotTextProps {
  accessibilityLabel?: string;
  controllerRef?: Ref<SlotTextController>;
  /**
   * Announce settled text to screen readers as it changes. Off by default:
   * a frequently-updating label would otherwise talk over everything else.
   */
  liveRegion?: boolean;
  options?: SlotOptions;
  /**
   * Honour the OS "reduce motion" setting by collapsing every roll to an
   * instant swap. Defaults to true; set false only when the animation carries
   * meaning that the static text does not.
   */
  respectReducedMotion?: boolean;
  /** Layout while nothing is rolling. See {@link SlotRestLayout}. */
  restLayout?: SlotRestLayout;
  /**
   * Animation key. A change re-rolls the current text even when it is
   * unchanged (pair with `skipUnchanged: false` for a full spin), mirroring
   * the web library's revision contract. Text changes always roll regardless.
   */
  revision?: number | string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  text: string;
  /**
   * Writing direction for the cell row. Defaults to "ltr" so Latin labels and
   * numbers keep their order inside an RTL app, where an inherited row would
   * otherwise lay the cells out right-to-left. Use "auto" to inherit, which is
   * what right-to-left text itself needs.
   */
  textDirection?: "auto" | "ltr" | "rtl";
  textStyle?: StyleProp<TextStyle>;
  /**
   * Extra glyphs to measure at mount alongside the initial text, so the first
   * roll starts immediately instead of waiting a layout pass. Pass the set the
   * label will cycle through — "0123456789" for a counter, "$.,%" for money.
   */
  warmupChars?: string;
}
