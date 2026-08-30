import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  chromatic,
  presets,
  SlotCounter,
  SlotText,
  useSlotTextController,
} from "slot-text-native";

/**
 * Recording surface for the library's README GIF. Not part of the app's
 * navigation — reach it with `hash://slot-demo`. Everything here drives the
 * public API directly (no AnimatedSlotText wrapper) so the capture shows what
 * a consumer actually writes.
 */

const AMOUNTS = [1284.5, 9930.25, 148.75, 27_410];
const LABELS = ["Recently added", "Lowest price", "Top rated", "Most popular"];
const STEP_MS = 1700;

export default function SlotDemoScreen() {
  const [step, setStep] = useState(0);
  const copyLabel = useSlotTextController();

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((current) => current + 1);
    }, STEP_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (step === 0) {
      return;
    }
    copyLabel.current?.flash("Copied", {
      revertAfter: 850,
      enter: { ...presets.snappy, color: chromatic(), direction: "up" },
      exit: { ...presets.snappy, direction: "down" },
    });
  }, [step, copyLabel]);

  return (
    <View style={styles.screen}>
      <View style={styles.block}>
        <Text style={styles.caption}>BALANCE</Text>
        <SlotCounter
          minimumFractionDigits={2}
          prefix="$"
          textStyle={styles.number}
          value={AMOUNTS[step % AMOUNTS.length] ?? 0}
        />
      </View>

      <View style={styles.block}>
        <Text style={styles.caption}>SORT</Text>
        <SlotText
          options={{
            ...presets.snappy,
            color: chromatic(),
            skipUnchanged: false,
          }}
          text={LABELS[step % LABELS.length] ?? ""}
          textStyle={styles.label}
        />
      </View>

      <View style={styles.block}>
        <Text style={styles.caption}>FLASH</Text>
        <View style={styles.button}>
          <SlotText
            controllerRef={copyLabel}
            text="Copy"
            textStyle={styles.buttonLabel}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: "center", gap: 6 },
  button: {
    alignSelf: "center",
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  buttonLabel: { color: "#ffffff", fontSize: 17, fontWeight: "600" },
  caption: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  label: { color: "#111827", fontSize: 26, fontWeight: "600" },
  number: { color: "#111827", fontSize: 40, fontWeight: "700" },
  screen: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    flex: 1,
    gap: 34,
    justifyContent: "center",
    paddingHorizontal: 34,
  },
});
