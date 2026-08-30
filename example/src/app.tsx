import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  useFonts,
} from "@expo-google-fonts/geist";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";
import { GeistPixel_400Regular } from "@expo-google-fonts/geist-pixel";
import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  chromatic,
  presets,
  type SlotAlign,
  SlotCounter,
  type SlotDirection,
  type SlotOptions,
  type SlotPresetName,
  type SlotRestLayout,
  SlotText,
  useSlotTextController,
} from "slot-text-native";

const LABELS = [
  "Recently added",
  "Lowest price",
  "Top rated",
  "Most popular",
] as const;

const STATUSES = ["Queued", "Building", "Published", "Verified"] as const;

const PRESET_NAMES: SlotPresetName[] = [
  "snappy",
  "calm",
  "odometer",
  "jackpot",
];

const AMOUNTS = [12_480, 9930.25, 148.75, 1_284_500, 27_410] as const;

const INK = "#ffffff";
const DIM = "rgba(255,255,255,0.45)";
const HAIRLINE = "rgba(255,255,255,0.12)";
const FILL = "rgba(255,255,255,0.07)";

const SANS = "Geist_400Regular";
const SANS_MEDIUM = "Geist_500Medium";
const SANS_SEMIBOLD = "Geist_600SemiBold";
const SANS_BOLD = "Geist_700Bold";
const MONO = "GeistMono_400Regular";
const PIXEL = "GeistPixel_400Regular";

export default function App() {
  const [fontsLoaded] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_400Regular,
    GeistPixel_400Regular,
  });

  const { width } = useWindowDimensions();
  const copy = useSlotTextController();

  const [amountIndex, setAmountIndex] = useState(0);
  const [labelIndex, setLabelIndex] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);
  const [preset, setPreset] = useState<SlotPresetName>("snappy");
  const [direction, setDirection] = useState<SlotDirection>("down");
  const [align, setAlign] = useState<SlotAlign>("start");
  const [restLayout, setRestLayout] = useState<SlotRestLayout>("text");
  const [rainbow, setRainbow] = useState(true);
  const [skipUnchanged, setSkipUnchanged] = useState(false);

  const options = useMemo<SlotOptions>(
    () => ({
      ...presets[preset],
      align,
      color: rainbow ? chromatic({ from: 8 }) : undefined,
      direction,
      skipUnchanged,
    }),
    [align, direction, preset, rainbow, skipUnchanged]
  );

  const nextAmount = useCallback(
    () => setAmountIndex((index) => index + 1),
    []
  );
  const nextLabel = useCallback(() => setLabelIndex((index) => index + 1), []);
  const nextStatus = useCallback(
    () => setStatusIndex((index) => index + 1),
    []
  );

  const flash = useCallback(() => {
    copy.current?.flash("Copied", {
      enter: { ...presets.snappy, color: chromatic(), direction: "up" },
      exit: { ...presets.snappy, direction: "down" },
    });
  }, [copy]);

  if (!fontsLoaded) {
    return <View style={styles.root} />;
  }

  const counterSize = width < 400 ? 38 : 44;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.wordmark}>slot-text-native</Text>
        <Text style={styles.tagline}>Text that rolls like a slot machine.</Text>

        <Section label="Counter">
          <SlotCounter
            minimumFractionDigits={2}
            prefix="$"
            textStyle={[styles.counter, { fontSize: counterSize }]}
            value={AMOUNTS[amountIndex % AMOUNTS.length] ?? 0}
          />
          <Row>
            <Chip label="Next amount" onPress={nextAmount} />
            <Hint>
              Cells align from the right, so the ones column stays put when the
              number grows a digit.
            </Hint>
          </Row>
        </Section>

        <Section label="Label">
          <SlotText
            options={options}
            restLayout={restLayout}
            text={LABELS[labelIndex % LABELS.length] ?? ""}
            textStyle={styles.label}
            warmupChars={LABELS.join("")}
          />
          <SlotText
            options={options}
            restLayout={restLayout}
            text={STATUSES[statusIndex % STATUSES.length] ?? ""}
            textStyle={styles.status}
            warmupChars={STATUSES.join("")}
          />
          <Row>
            <Chip label="Sort" onPress={nextLabel} />
            <Chip label="Status" onPress={nextStatus} />
          </Row>
        </Section>

        <Section label="Flash">
          <Pressable onPress={flash} style={styles.cta}>
            <SlotText
              controllerRef={copy}
              text="Copy"
              textStyle={styles.ctaLabel}
            />
          </Pressable>
          <Hint>
            flash() shows temporary text and rolls back on its own. Tap again
            while it is up and the countdown restarts, rather than queueing a
            second roll behind the first.
          </Hint>
        </Section>

        <Section label="Preset">
          <Segmented
            onChange={setPreset}
            options={PRESET_NAMES}
            value={preset}
          />
        </Section>

        <Section label="Options">
          <Setting label="direction">
            <Segmented
              onChange={setDirection}
              options={["down", "up"] as SlotDirection[]}
              value={direction}
            />
          </Setting>
          <Setting label="align">
            <Segmented
              onChange={setAlign}
              options={["start", "end"] as SlotAlign[]}
              value={align}
            />
          </Setting>
          <Setting label="restLayout">
            <Segmented
              onChange={setRestLayout}
              options={["text", "slots"] as SlotRestLayout[]}
              value={restLayout}
            />
          </Setting>
          <Setting label="chromatic">
            <Toggle onChange={setRainbow} value={rainbow} />
          </Setting>
          <Setting label="skipUnchanged">
            <Toggle onChange={setSkipUnchanged} value={skipUnchanged} />
          </Setting>
        </Section>

        <Text style={styles.footer}>
          Reduce Motion is honoured automatically — every roll collapses to an
          instant swap, with no other behaviour change.
        </Text>
      </ScrollView>
    </View>
  );
}

function Section({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

function Hint({ children }: { children: ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

// Module scope keeps the reference stable across renders.
const chipStyle = ({ pressed }: { pressed: boolean }) => [
  styles.chip,
  pressed && styles.chipPressed,
];

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={chipStyle}>
      <Text style={styles.chipLabel}>{label}</Text>
    </Pressable>
  );
}

function Setting({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View style={styles.setting}>
      <Text style={styles.settingLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Segmented<T extends string>({
  onChange,
  options,
  value,
}: {
  onChange: (next: T) => void;
  options: readonly T[];
  value: T;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Segment
          active={option === value}
          key={option}
          onChange={onChange}
          option={option}
        />
      ))}
    </View>
  );
}

function Segment<T extends string>({
  active,
  onChange,
  option,
}: {
  active: boolean;
  onChange: (next: T) => void;
  option: T;
}) {
  const press = useCallback(() => onChange(option), [onChange, option]);

  return (
    <Pressable
      onPress={press}
      style={[styles.segment, active && styles.segmentActive]}
    >
      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
        {option}
      </Text>
    </Pressable>
  );
}

function Toggle({
  onChange,
  value,
}: {
  onChange: (next: boolean) => void;
  value: boolean;
}) {
  const press = useCallback(() => onChange(!value), [onChange, value]);

  return (
    <Pressable onPress={press} style={[styles.track, value && styles.trackOn]}>
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: FILL,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipLabel: { color: INK, fontFamily: SANS_MEDIUM, fontSize: 13 },
  chipPressed: { opacity: 0.55 },
  content: {
    gap: 30,
    paddingBottom: 72,
    paddingHorizontal: 24,
    paddingTop: 84,
  },
  counter: { color: INK, fontFamily: SANS_BOLD, letterSpacing: -1 },
  cta: {
    alignSelf: "flex-start",
    backgroundColor: INK,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  ctaLabel: { color: "#000000", fontFamily: SANS_BOLD, fontSize: 17 },
  footer: { color: DIM, fontFamily: SANS, fontSize: 12, lineHeight: 18 },
  hint: { color: DIM, flexShrink: 1, fontFamily: MONO, fontSize: 11 },
  knob: { backgroundColor: DIM, borderRadius: 999, height: 20, width: 20 },
  knobOn: { backgroundColor: "#000000", transform: [{ translateX: 20 }] },
  label: { color: INK, fontFamily: SANS_SEMIBOLD, fontSize: 27 },
  root: { backgroundColor: "#000000", flex: 1 },
  row: { alignItems: "center", flexDirection: "row", gap: 12 },
  section: {
    borderTopColor: HAIRLINE,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 14,
    paddingTop: 18,
  },
  sectionBody: { gap: 14 },
  sectionLabel: {
    color: DIM,
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  segment: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  segmentActive: { backgroundColor: INK },
  segmented: {
    backgroundColor: FILL,
    borderRadius: 10,
    flexDirection: "row",
    padding: 3,
  },
  segmentLabel: { color: DIM, fontFamily: MONO, fontSize: 12 },
  segmentLabelActive: { color: "#000000" },
  setting: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  settingLabel: { color: INK, fontFamily: MONO, fontSize: 13 },
  status: { color: DIM, fontFamily: SANS_MEDIUM, fontSize: 19 },
  tagline: { color: DIM, fontFamily: SANS, fontSize: 14, marginTop: -16 },
  track: { backgroundColor: FILL, borderRadius: 999, padding: 3, width: 46 },
  trackOn: { backgroundColor: INK },
  wordmark: { color: INK, fontFamily: PIXEL, fontSize: 30, letterSpacing: 0.5 },
});
