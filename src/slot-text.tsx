import {
  type ComponentRef,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  type LayoutChangeEvent,
  Platform,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
} from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { SlotTextMachineDelegate } from "./state-machine";
import { SlotTextMachine } from "./state-machine";
import type {
  SlotTextController,
  SlotTextControllerRef,
  SlotTextProps,
  TransitionPlan,
} from "./types";
import {
  buildTransitionPlan,
  glyph,
  type Rgba,
  splitGraphemes,
  toRgba,
  toRgbaOrBlack,
  withoutMotion,
} from "./utils";

const DEFAULT_TEXT_COLOR = "#111827";
// Resolved once: calling .factory() per glyph per transition would rebuild the
// bezier solver thousands of times for a line of text.
const WIDTH_EASING = Easing.bezier(0.2, 0, 0, 1).factory();
const MIN_WIDTH_CHANGE = 0.5;
const DEGREES_PER_BOUNCE = 5;
const EMPTY_SIZES: ReadonlyMap<string, GlyphSize> = new Map();

interface GlyphSize {
  height: number;
  width: number;
}

interface GlyphMetrics {
  key: string;
  sizes: Map<string, GlyphSize>;
}

interface TransitionState {
  key: number;
  plan: TransitionPlan;
  settled: boolean;
}

/**
 * Everything one glyph needs to draw itself at an arbitrary point on the
 * transition clock. Pure numbers, resolved on the JS thread once per
 * transition, so the UI thread never parses a color or rebuilds an easing.
 */
interface GlyphAnimation {
  colorDelay: number;
  colorDuration: number;
  enterDelay: number;
  exitDelay: number;
  fromWidth: number;
  inY: number;
  outY: number;
  restColor: Rgba;
  slideDuration: number;
  tilt: number;
  tintColor: Rgba | undefined;
  toWidth: number;
  widthDelay: number;
  widthDuration: number;
}

/** Local progress of one sub-animation on the shared transition clock. */
function localProgress(elapsed: number, delay: number, duration: number) {
  "worklet";
  if (duration <= 0) {
    return 1;
  }
  const t = (elapsed - delay) / duration;
  if (t <= 0) {
    return 0;
  }
  return t >= 1 ? 1 : t;
}

function mixColor(from: Rgba, to: Rgba, t: number) {
  "worklet";
  const r = Math.round(from.r + (to.r - from.r) * t);
  const g = Math.round(from.g + (to.g - from.g) * t);
  const b = Math.round(from.b + (to.b - from.b) * t);
  const a = from.a + (to.a - from.a) * t;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function useSlotTextController(): SlotTextControllerRef {
  return useRef<SlotTextController>(null);
}

export const SlotText = forwardRef<ComponentRef<typeof View>, SlotTextProps>(
  (
    {
      accessibilityLabel,
      controllerRef,
      liveRegion = false,
      options,
      respectReducedMotion = true,
      restLayout = "text",
      revision,
      style,
      testID,
      text,
      textDirection = "ltr",
      textStyle,
      warmupChars,
    },
    forwardedRef
  ) => {
    const flattenedTextStyle = useMemo<TextStyle | undefined>(
      () => StyleSheet.flatten(textStyle) as TextStyle | undefined,
      [textStyle]
    );
    const baseColor =
      typeof flattenedTextStyle?.color === "string"
        ? flattenedTextStyle.color
        : DEFAULT_TEXT_COLOR;

    // Reduced motion collapses the timings rather than bypassing the machine,
    // so set/flash/queue semantics and `value` stay identical either way.
    const systemReducedMotion = useReducedMotion();
    const motionless = respectReducedMotion && systemReducedMotion;
    const effectiveOptions = useMemo(
      () => (motionless ? withoutMotion(options) : options),
      [motionless, options]
    );

    const [transition, setTransition] = useState<TransitionState>(() => ({
      key: 0,
      plan: buildTransitionPlan(text, text, effectiveOptions),
      settled: true,
    }));

    const sequenceRef = useRef(0);
    const viewRef = useRef<ComponentRef<typeof View>>(null);
    const initialOptionsRef = useRef(effectiveOptions);
    const initialTextRef = useRef(text);
    const latestTextRef = useRef(text);
    const machineRef = useRef<SlotTextMachine | null>(null);

    // The delegate closes over nothing that changes between renders, so it is
    // built once. That is what lets the machine live in a ref without any
    // render-phase writes to keep it current.
    const delegate = useMemo<SlotTextMachineDelegate>(
      () => ({
        settle(nextText) {
          setTransition((current) => ({
            key: current.key,
            plan: buildTransitionPlan(nextText, nextText, current.plan.options),
            settled: true,
          }));
        },
        startTransition(_fromText, _toText, plan) {
          sequenceRef.current += 1;
          setTransition({
            key: sequenceRef.current,
            plan,
            settled: !plan.changed,
          });
          return plan.total;
        },
      }),
      []
    );

    const controller = useMemo<SlotTextController>(
      () => ({
        destroy() {
          machineRef.current?.destroy();
        },
        flash(nextText, flashOptions) {
          machineRef.current?.flash(nextText, flashOptions);
        },
        set(nextText, nextOptions) {
          machineRef.current?.set(nextText, nextOptions);
        },
        get value() {
          return machineRef.current?.value ?? latestTextRef.current;
        },
      }),
      []
    );

    // Declared first so every effect below can rely on the machine existing.
    // Creating it here rather than lazily during render keeps the render pure
    // and survives StrictMode's setup/cleanup/setup replay.
    useEffect(() => {
      machineRef.current = new SlotTextMachine(
        initialTextRef.current,
        initialOptionsRef.current ?? {},
        delegate
      );

      return () => {
        machineRef.current?.destroy();
        machineRef.current = null;
      };
    }, [delegate]);

    useEffect(() => {
      machineRef.current?.setBaseOptions(effectiveOptions ?? {});
    }, [effectiveOptions]);

    // Roll only when the text or the animation revision changes. The machine
    // already holds the latest base options, so set() takes none: an inline
    // options object in the parent can never re-fire (and interrupt) a roll.
    const previousTextRef = useRef(text);
    const previousRevisionRef = useRef(revision);
    useEffect(() => {
      latestTextRef.current = text;
      const textChanged = previousTextRef.current !== text;
      const revisionChanged = previousRevisionRef.current !== revision;
      if (!(textChanged || revisionChanged)) {
        return;
      }
      previousTextRef.current = text;
      previousRevisionRef.current = revision;
      machineRef.current?.set(text);
    }, [revision, text]);

    useImperativeHandle(controllerRef, () => controller, [controller]);
    useImperativeHandle(
      forwardedRef,
      () => viewRef.current as ComponentRef<typeof View>,
      []
    );

    // --- Glyph metrics -----------------------------------------------------
    // Held in state keyed by the text style, so a style change derives a fresh
    // cache instead of mutating one during render.
    const styleKey = useMemo(
      () => JSON.stringify(flattenedTextStyle ?? {}),
      [flattenedTextStyle]
    );
    const [metrics, setMetrics] = useState<GlyphMetrics>(() => ({
      key: styleKey,
      sizes: new Map(),
    }));
    if (metrics.key !== styleKey) {
      setMetrics({ key: styleKey, sizes: new Map() });
    }
    const sizes = metrics.key === styleKey ? metrics.sizes : EMPTY_SIZES;

    // onLayout fires once per glyph. Buffering the batch and committing it in
    // a single update turns N re-renders per measure pass into one.
    const pendingRef = useRef<Map<string, GlyphSize>>(new Map());
    const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
      () => () => {
        if (flushRef.current) {
          clearTimeout(flushRef.current);
        }
      },
      []
    );
    const onGlyphMeasured = useCallback(
      (measuredKey: string, char: string, size: GlyphSize) => {
        pendingRef.current.set(char, size);

        if (flushRef.current) {
          return;
        }

        flushRef.current = setTimeout(() => {
          flushRef.current = null;
          const batch = pendingRef.current;
          pendingRef.current = new Map();

          if (batch.size === 0) {
            return;
          }

          setMetrics((current) => {
            if (current.key !== measuredKey) {
              return current;
            }

            const next = new Map(current.sizes);
            for (const [key, value] of batch) {
              next.set(key, value);
            }

            return { key: measuredKey, sizes: next };
          });
        }, 0);
      },
      []
    );

    const {
      entries,
      fromChars,
      options: planOptions,
      toChars,
    } = transition.plan;

    // Warm-up glyphs are measured at mount alongside the initial text, so the
    // first roll starts on the same frame as every later one instead of
    // stalling a layout pass behind the measure pass.
    const warmupList = useMemo(
      () => (warmupChars ? splitGraphemes(warmupChars) : []),
      [warmupChars]
    );
    const involvedChars = useMemo(() => {
      const set = new Set<string>();
      for (const char of fromChars) {
        set.add(char);
      }
      for (const char of toChars) {
        set.add(char);
      }
      set.delete("");
      return [...set];
    }, [fromChars, toChars]);
    const unmeasuredChars = useMemo(() => {
      const wanted = new Set(involvedChars);
      for (const char of warmupList) {
        if (char !== "") {
          wanted.add(char);
        }
      }
      return [...wanted].filter((char) => !sizes.has(char));
    }, [involvedChars, sizes, warmupList]);

    const measured = involvedChars.every((char) => sizes.has(char));
    const rolling = !transition.settled && measured;

    let glyphHeight = 0;
    for (const char of involvedChars) {
      glyphHeight = Math.max(glyphHeight, sizes.get(char)?.height ?? 0);
    }

    // Horizontal clip relief. RN has no per-axis overflow, so the vertical
    // roll mask also crops sideways — where the web build keeps overflow-x
    // visible for tilt corners and glyph overhang. Widening the cell by the
    // tilt's horizontal reach and pulling it back with a negative margin
    // restores that room without moving the glyph or the row.
    const overhang = useMemo(() => {
      const maxTilt = planOptions.bounce * DEGREES_PER_BOUNCE;
      if (maxTilt <= 0 || glyphHeight <= 0) {
        return 0;
      }
      return (
        Math.ceil((glyphHeight * Math.sin((maxTilt * Math.PI) / 180)) / 2) + 1
      );
    }, [glyphHeight, planOptions.bounce]);

    const animations = useMemo<(GlyphAnimation | null)[]>(() => {
      if (!rolling) {
        return [];
      }

      const restColor = toRgbaOrBlack(baseColor);
      const travel = Math.ceil(glyphHeight);
      const outY = planOptions.direction === "down" ? travel : -travel;
      const inY = planOptions.direction === "down" ? -travel : travel;

      return entries.map((entry) => {
        if (!entry.animates) {
          return null;
        }

        const fromWidth = sizes.get(entry.fromChar)?.width ?? 0;
        const toWidth = sizes.get(entry.toChar)?.width ?? 0;
        const widthChanges = Math.abs(toWidth - fromWidth) > MIN_WIDTH_CHANGE;

        return {
          colorDelay: entry.colorDelay,
          colorDuration: planOptions.colorFade,
          enterDelay: entry.exitDelay,
          exitDelay: entry.timing.base,
          fromWidth,
          inY,
          outY,
          restColor,
          slideDuration: entry.timing.duration,
          tilt: entry.timing.tilt,
          tintColor: entry.toChar === "" ? undefined : toRgba(entry.tint),
          toWidth,
          widthDelay: widthChanges ? entry.width.delay : 0,
          widthDuration: widthChanges ? entry.width.duration : 0,
        } satisfies GlyphAnimation;
      });
    }, [baseColor, entries, glyphHeight, planOptions, rolling, sizes]);

    // One clock for the whole label. Every glyph derives its own slice of the
    // stagger from it, so a roll costs a single animation no matter how long
    // the text is — and a busy JS thread cannot stall the wave halfway.
    const clock = useSharedValue(0);
    const epoch = useSharedValue(-1);
    const easingFn = useMemo(() => {
      const { easing } = planOptions;
      return typeof easing === "function" ? easing : easing.factory();
    }, [planOptions.easing]);

    const { total } = transition.plan;
    useEffect(() => {
      if (!rolling) {
        return;
      }

      // Arming the epoch is what releases the glyphs from their start pose, so
      // the first painted frame is correct even before this effect runs.
      clock.value = 0;
      epoch.value = transition.key;
      clock.value = withTiming(total, {
        duration: total,
        easing: Easing.linear,
      });
      machineRef.current?.notePainted();
    }, [clock, epoch, rolling, total, transition.key]);

    const settledText = toChars.join("");
    useEffect(() => {
      if (!(liveRegion && transition.settled)) {
        return;
      }
      if (Platform.OS === "ios") {
        // Android gets this from accessibilityLiveRegion on the row.
        AccessibilityInfo.announceForAccessibility(settledText);
      }
    }, [liveRegion, settledText, transition.settled]);

    const sizerStyle = useMemo(
      () => [flattenedTextStyle, styles.sizer],
      [flattenedTextStyle]
    );
    const faceStyle = useMemo(
      () => [flattenedTextStyle, styles.face, { color: baseColor }],
      [baseColor, flattenedTextStyle]
    );
    const staticFaceStyle = useMemo(
      () => [flattenedTextStyle, styles.staticFace, { color: baseColor }],
      [baseColor, flattenedTextStyle]
    );
    const rowStyle = useMemo(
      () => [
        styles.row,
        textDirection === "auto" ? null : { direction: textDirection },
        style,
      ],
      [style, textDirection]
    );

    const showSlots = rolling || (restLayout === "slots" && measured);

    return (
      <View
        accessibilityLabel={accessibilityLabel ?? settledText}
        accessibilityLiveRegion={liveRegion ? "polite" : "none"}
        accessible
        ref={viewRef}
        style={rowStyle}
        testID={testID}
      >
        {unmeasuredChars.length > 0 ? (
          <MeasurePass
            chars={unmeasuredChars}
            metricsKey={styleKey}
            onGlyphMeasured={onGlyphMeasured}
            sizerStyle={sizerStyle}
          />
        ) : null}
        {showSlots ? (
          entries.map((entry, index) => {
            const animation = rolling ? animations[index] : null;
            const key = `slot-${index}`;

            if (!animation) {
              const char = entry.toChar;
              return char === "" ? null : (
                <StaticSlot
                  char={char}
                  faceStyle={staticFaceStyle}
                  height={glyphHeight}
                  key={key}
                  overhang={overhang}
                  width={sizes.get(char)?.width ?? 0}
                />
              );
            }

            return (
              <RollingSlot
                animation={animation}
                clock={clock}
                easing={easingFn}
                epoch={epoch}
                faceStyle={faceStyle}
                fromChar={entry.fromChar}
                height={glyphHeight}
                key={key}
                overhang={overhang}
                toChar={entry.toChar}
                transitionKey={transition.key}
              />
            );
          })
        ) : (
          <Text numberOfLines={1} style={staticFaceStyle}>
            {transition.settled ? settledText : fromChars.join("")}
          </Text>
        )}
      </View>
    );
  }
);

SlotText.displayName = "SlotText";

interface MeasurePassProps {
  chars: string[];
  metricsKey: string;
  onGlyphMeasured: (key: string, char: string, size: GlyphSize) => void;
  sizerStyle: StyleProp<TextStyle>;
}

const MeasurePass = memo(function MeasurePassImpl({
  chars,
  metricsKey,
  onGlyphMeasured,
  sizerStyle,
}: MeasurePassProps) {
  return (
    <View pointerEvents="none" style={styles.measurePass}>
      {chars.map((char) => (
        <Sizer
          char={char}
          key={char}
          metricsKey={metricsKey}
          onGlyphMeasured={onGlyphMeasured}
          sizerStyle={sizerStyle}
        />
      ))}
    </View>
  );
});

interface SizerProps extends Omit<MeasurePassProps, "chars"> {
  char: string;
}

const Sizer = memo(function SizerImpl({
  char,
  metricsKey,
  onGlyphMeasured,
  sizerStyle,
}: SizerProps) {
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onGlyphMeasured(metricsKey, char, {
        height: event.nativeEvent.layout.height,
        width: event.nativeEvent.layout.width,
      });
    },
    [char, metricsKey, onGlyphMeasured]
  );

  return (
    <Text onLayout={handleLayout} style={sizerStyle}>
      {glyph(char)}
    </Text>
  );
});

interface StaticSlotProps {
  char: string;
  faceStyle: StyleProp<TextStyle>;
  height: number;
  overhang: number;
  width: number;
}

/**
 * A cell that is not moving this transition. It keeps the same geometry as a
 * rolling cell so held glyphs never shift when their neighbours animate.
 */
const StaticSlot = memo(function StaticSlotImpl({
  char,
  faceStyle,
  height,
  overhang,
  width,
}: StaticSlotProps) {
  const slotStyle = useMemo(
    () => [
      styles.slot,
      {
        height,
        marginHorizontal: -overhang,
        width: width + overhang * 2,
      },
    ],
    [height, overhang, width]
  );

  return (
    <View style={slotStyle}>
      <Text numberOfLines={1} style={faceStyle}>
        {glyph(char)}
      </Text>
    </View>
  );
});

interface RollingSlotProps {
  animation: GlyphAnimation;
  clock: SharedValue<number>;
  easing: (t: number) => number;
  epoch: SharedValue<number>;
  faceStyle: StyleProp<TextStyle>;
  fromChar: string;
  height: number;
  overhang: number;
  toChar: string;
  transitionKey: number;
}

/**
 * One cell mid-roll. Every value is derived from the shared clock inside a
 * worklet, so the whole staggered timeline is declared once instead of being
 * scheduled as six animations per glyph — and the cell survives across
 * transitions rather than remounting, because only its props change.
 */
const RollingSlot = memo(function RollingSlotImpl({
  animation,
  clock,
  easing,
  epoch,
  faceStyle,
  fromChar,
  height,
  overhang,
  toChar,
  transitionKey,
}: RollingSlotProps) {
  const slotStyle = useAnimatedStyle(() => {
    const elapsed = epoch.value === transitionKey ? clock.value : 0;
    const t = localProgress(
      elapsed,
      animation.widthDelay,
      animation.widthDuration
    );
    const width =
      animation.widthDuration <= 0
        ? animation.toWidth
        : animation.fromWidth +
          (animation.toWidth - animation.fromWidth) * WIDTH_EASING(t);

    return { width: width + overhang * 2 };
  }, [animation, overhang, transitionKey]);

  const oldFaceStyle = useAnimatedStyle(() => {
    const elapsed = epoch.value === transitionKey ? clock.value : 0;
    const progress = easing(
      localProgress(elapsed, animation.exitDelay, animation.slideDuration)
    );

    return {
      transform: [
        { translateY: animation.outY * progress },
        { rotateZ: `${-animation.tilt * progress}deg` },
      ],
    };
  }, [animation, easing, transitionKey]);

  const newFaceStyle = useAnimatedStyle(() => {
    const elapsed = epoch.value === transitionKey ? clock.value : 0;
    const remaining =
      1 -
      easing(
        localProgress(elapsed, animation.enterDelay, animation.slideDuration)
      );
    const transform = [
      { translateY: animation.inY * remaining },
      { rotateZ: `${animation.tilt * remaining}deg` },
    ];

    // Untinted rolls skip color entirely rather than rebuilding an rgba()
    // string every frame; the base style already carries the resting color.
    if (!animation.tintColor) {
      return { transform };
    }

    return {
      color: mixColor(
        animation.tintColor,
        animation.restColor,
        localProgress(elapsed, animation.colorDelay, animation.colorDuration)
      ),
      transform,
    };
  }, [animation, easing, transitionKey]);

  const containerStyle = useMemo(
    () => [styles.slot, { height, marginHorizontal: -overhang }, slotStyle],
    [height, overhang, slotStyle]
  );

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={containerStyle}
    >
      {fromChar === "" ? null : (
        <Animated.Text numberOfLines={1} style={[faceStyle, oldFaceStyle]}>
          {glyph(fromChar)}
        </Animated.Text>
      )}
      {toChar === "" ? null : (
        <Animated.Text numberOfLines={1} style={[faceStyle, newFaceStyle]}>
          {glyph(toChar)}
        </Animated.Text>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  face: {
    bottom: 0,
    includeFontPadding: false,
    left: 0,
    position: "absolute",
    right: 0,
    textAlign: "center",
    top: 0,
  },
  measurePass: {
    flexDirection: "row",
    left: 0,
    opacity: 0,
    position: "absolute",
    top: 0,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  sizer: {
    includeFontPadding: false,
    opacity: 0,
  },
  slot: {
    overflow: "hidden",
    position: "relative",
  },
  staticFace: {
    includeFontPadding: false,
  },
});
