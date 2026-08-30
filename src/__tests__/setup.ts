import { mock } from "bun:test";

declare global {
  // eslint-disable-next-line no-var
  var __slotTextReducedMotion: boolean;
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.__slotTextReducedMotion = false;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const identityEasing = (t: number) => t;

mock.module("react-native-reanimated", () => ({
  default: {
    Text: "AnimatedText",
    View: "AnimatedView",
  },
  Easing: {
    bezier: () => ({ factory: () => identityEasing }),
    linear: identityEasing,
  },
  // Styles are evaluated eagerly so tests can assert the pose a glyph would
  // paint at the current clock value.
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: () => globalThis.__slotTextReducedMotion,
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown) => value,
}));

const flatten = (style: unknown): unknown => {
  if (!Array.isArray(style)) {
    return style;
  }

  const merged: Record<string, unknown> = {};
  for (const entry of style.flat(Number.POSITIVE_INFINITY)) {
    if (entry && typeof entry === "object") {
      Object.assign(merged, entry);
    }
  }

  return merged;
};

mock.module("react-native", () => ({
  AccessibilityInfo: {
    announceForAccessibility: () => undefined,
  },
  Platform: { OS: "ios" },
  processColor: (color: string) => {
    if (color === "#ff0000") {
      return 0xff_ff_00_00;
    }
    return 0xff_11_18_27;
  },
  StyleSheet: {
    create: <T>(styles: T) => styles,
    flatten,
  },
  Text: "Text",
  View: "View",
}));
