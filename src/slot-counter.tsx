import { memo, useMemo, useState } from "react";
import { StyleSheet, type TextStyle } from "react-native";
import { SlotText } from "./slot-text";
import type { SlotCounterProps, SlotDirection, SlotOptions } from "./types";

// Digits plus the signs a formatter can emit. Locale-specific separators are
// discovered from a sample format rather than guessed.
const ALWAYS_WARM = "0123456789-−+";
const SAMPLE_VALUE = -1_234_567.89;

const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };

interface Tracked {
  direction: SlotDirection;
  value: number;
}

/**
 * A number that rolls like an odometer.
 *
 * Everything here is `SlotText` with counter-shaped defaults: cells align from
 * the right so the ones column never moves, digits are measured up front so
 * the first tick is as fast as the rest, tabular figures keep every cell the
 * same width, and the roll direction follows whether the value went up or
 * down. Every default is overridable.
 */
export const SlotCounter = memo(function SlotCounterImpl({
  format,
  locale,
  maximumFractionDigits,
  minimumFractionDigits,
  options,
  prefix = "",
  restLayout = "slots",
  suffix = "",
  tabularNums = true,
  textStyle,
  useGrouping = true,
  value,
  warmupChars = "",
  ...props
}: SlotCounterProps) {
  const formatter = useMemo(() => {
    if (format) {
      return format;
    }

    const intl = new Intl.NumberFormat(locale, {
      maximumFractionDigits,
      minimumFractionDigits,
      useGrouping,
    });

    return (input: number) => intl.format(input);
  }, [
    format,
    locale,
    maximumFractionDigits,
    minimumFractionDigits,
    useGrouping,
  ]);

  // The previous value, tracked so the roll direction can follow the delta.
  // Adjusting state during render is the supported way to derive from props;
  // a ref written in render would be lost on a discarded render.
  const [tracked, setTracked] = useState<Tracked>(() => ({
    direction: "up",
    value,
  }));
  if (tracked.value !== value) {
    setTracked({
      direction: value >= tracked.value ? "up" : "down",
      value,
    });
  }

  const text = `${prefix}${formatter(value)}${suffix}`;

  const resolvedOptions = useMemo<SlotOptions>(
    () => ({
      align: "end",
      direction: tracked.direction,
      ...options,
    }),
    [options, tracked.direction]
  );

  // Every glyph the counter can ever show, measured at mount: the digits, the
  // separators this locale actually emits, and the caller's affixes.
  const resolvedWarmup = useMemo(
    () =>
      `${ALWAYS_WARM}${formatter(SAMPLE_VALUE)}${prefix}${suffix}${warmupChars}`,
    [formatter, prefix, suffix, warmupChars]
  );

  const resolvedTextStyle = useMemo(
    () => (tabularNums ? StyleSheet.flatten([TABULAR, textStyle]) : textStyle),
    [tabularNums, textStyle]
  );

  return (
    <SlotText
      {...props}
      options={resolvedOptions}
      restLayout={restLayout}
      text={text}
      textStyle={resolvedTextStyle}
      warmupChars={resolvedWarmup}
    />
  );
});

SlotCounter.displayName = "SlotCounter";
