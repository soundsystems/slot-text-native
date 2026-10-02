# slot-text-native

**Text that rolls like a slot machine — for React Native and Expo.**

> ### A port of [slot-text](https://www.npmjs.com/package/slot-text) by Daniel Belyi
>
> The animation design, the option names, the defaults and the feel are all
> his — this is his library rebuilt for React Native on Reanimated, because the
> original is a browser-only DOM utility. Not affiliated with or endorsed by
> the original author. This port is Apache-2.0 licensed; the original remains
> MIT licensed, with its copyright and permission notice preserved in
> [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
>
> **Building for the web? Use [slot-text](https://www.npmjs.com/package/slot-text) instead.**

[![npm](https://img.shields.io/npm/v/slot-text-native)](https://www.npmjs.com/package/slot-text-native)
[![bundle](https://img.shields.io/bundlephobia/minzip/slot-text-native)](https://bundlephobia.com/package/slot-text-native)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](./LICENSE)

Every character sits in its own clipped cell and changes by sliding. The new
glyph enters from one side while the old one leaves the other, chasing it by a
stagger step, with a springy overshoot so each letter lands with a little
bounce. Counters, prices, live stats, sort labels, Copy → Copied buttons.

Works with **any string**, not just digits — `Recently added` → `Top rated`
rolls just as cleanly as `999` → `1,000`.

<p align="center">
  <img
    alt="A balance counter rolling to a new value, a sort label rolling with a chromatic sweep, and a Copy button flashing Copied"
    src="https://gitlab.com/soundsystems/slot-text-native/-/raw/main/docs/demo.gif"
    width="640"
  >
</p>

```tsx
<SlotCounter value={balance} prefix="$" />
<SlotText text={copied ? "Copied" : "Copy"} />
```

## Why this one

- **Arbitrary text, not just numbers.** Most React Native "slot" packages are
  odometers: `from` → `to`, digits only. This animates any string, including
  length changes, with per-glyph measurement and eased cell resizing so a wide
  glyph is never cropped by a suddenly-narrow cell.
- **One animation per roll, not one per letter.** A single Reanimated clock
  drives the whole label; each cell derives its own slice of the stagger inside
  its worklet. A long label costs the same as a short one, and a busy JS thread
  can't freeze the wave half-way through a word.
- **Zero runtime dependencies.** One peer (Reanimated, which you already have).
  No SVG, no masked view, no gradient library, no native module, no config
  plugin. Works in bare React Native as well as Expo.
- **Interruptible.** Spam the trigger. Rolls interrupt cleanly or queue behind
  each other, and `flash()` handles the whole Copy → Copied → Copy cycle.
- **Accessible by default.** Reduce Motion collapses rolls to instant swaps
  with no behaviour change; mid-roll cells are hidden from screen readers.

## Install

```bash
pnpx expo install slot-text-native react-native-reanimated
```

Reanimated 4+ with its babel plugin configured. That's the whole setup.

Peer range is deliberately wide (`react-native >=0.78`, `reanimated >=4.0`),
but the library, its tests and the example app are all developed and verified
against one stack — the one Expo SDK 57 pins:

| | |
|---|---|
| react-native | 0.86.3 |
| react-native-reanimated | 4.5.1 |
| react-native-worklets | 0.10.1 |
| react | 19.2.3 |

## Counters

`SlotCounter` is `SlotText` with counter-shaped defaults, so the ones column
never moves and the first tick is as fast as every later one:

```tsx
import { SlotCounter } from "slot-text-native";

<SlotCounter value={1234567} />                        // 1,234,567
<SlotCounter value={42.5} prefix="$" minimumFractionDigits={2} />
<SlotCounter value={total} locale="de-DE" />           // 1.234.567
<SlotCounter value={views} format={(n) => `${n / 1000}k`} />
```

What it sets up for you:

| | |
|---|---|
| `align: "end"` | `99 → 100` grows a new cell on the **left**. The ones column stays put, like a real odometer. |
| Direction follows the delta | Rising values roll up, falling values roll down. |
| Digits pre-measured | Every digit, the locale's separators and your affixes are measured at mount, so the first tick doesn't stall. |
| `tabular-nums` | Equal-width digit cells, so nothing shimmies as the number changes. |
| `restLayout: "slots"` | Cells stay mounted between ticks — no remounting on a value that updates often. |

All of it is overridable: `options`, `restLayout`, `tabularNums`, `textStyle`.

Props: `value`, `prefix`, `suffix`, `locale`, `minimumFractionDigits`,
`maximumFractionDigits`, `useGrouping`, `format`, `tabularNums`, plus
everything `SlotText` takes.

## Text

```tsx
import { SlotText, chromatic } from "slot-text-native";

export function CopyLabel({ copied }: { copied: boolean }) {
  return (
    <SlotText
      text={copied ? "Copied" : "Copy"}
      textStyle={{ fontSize: 16, fontWeight: "600" }}
      options={{
        direction: copied ? "up" : "down",
        color: copied ? chromatic() : undefined,
      }}
    />
  );
}
```

`chromatic()` tints each incoming glyph its own hue and fades it back to the
resting colour as it lands — a spectrum sweep across the word.

### Imperative control

`flash()` shows temporary text and rolls back on its own. It's spam-safe:
repeated flashes restart the revert timer instead of queueing extra rolls, and
an explicit `set()` cancels a pending revert.

```tsx
import { SlotText, useSlotTextController } from "slot-text-native";

function CopyButton() {
  const label = useSlotTextController();

  return (
    <Pressable onPress={() => label.current?.flash("Copied")}>
      <SlotText controllerRef={label} text="Copy" />
    </Pressable>
  );
}
```

```ts
label.current.set("Copied", { direction: "up" });
label.current.flash("Copied", {
  revertAfter: 1400,
  enter: { direction: "up", color: chromatic() },
  exit: { direction: "down" },
});
label.current.value;     // the text currently targeted
label.current.destroy();
```

## Options

```ts
type SlotOptions = {
  align?: "start" | "end";   // "start" — which end holds still on a length change
  direction?: "up" | "down"; // "down"
  stagger?: number;          // 45   — per-character delay
  duration?: number;         // 300  — slide duration per character
  exitOffset?: number;       // 50   — how far the incoming glyph trails
  easing?: EasingFunction;   // Easing.bezier(0.34, 1.56, 0.64, 1)
  bounce?: number;           // 0.6  — per-letter speed and tilt variation
  color?: string | ((index, total) => string);
  colorFade?: number;        // 280  — tint fade-back
  skipUnchanged?: boolean;   // true — hold identical glyphs still
  interrupt?: boolean;       // true — cut a running roll, or queue behind it
};
```

`interrupt: true` cuts off any roll in flight and starts fresh from its target.
`interrupt: false` lets the current roll finish and plays the latest call made
mid-roll once it lands — good for spam-prone triggers.

`skipUnchanged: true` holds identical characters at the same index still, which
is what you want for aligned labels (`Copy` → `Copied`). Turn it off when the
two strings share nothing, so the whole line rolls as one.

A custom `easing` runs on the UI thread, so a plain function must be a worklet.
Anything from Reanimated's `Easing` already is.

### Presets

Curated option sets for common jobs — spread one and override what you need:

```tsx
import { presets, SlotText } from "slot-text-native";

<SlotText text={sortLabel} options={presets.snappy} />
<SlotText text={status} options={{ ...presets.calm, direction: "up" }} />
```

| Preset | Feel | For |
|---|---|---|
| `snappy` | Quick, tight | Interface labels — sort controls, tabs, button text |
| `calm` | Barely-there | Dense or serious surfaces where motion should whisper |
| `odometer` | End-aligned digits | Pre-formatted numbers `SlotCounter` can't express |
| `jackpot` | Slow chromatic wave | Celebratory reveals — totals, wins |

No preset at all gives the library default: a springy 300 ms roll.

## Props

| Prop | Default | |
|---|---|---|
| `text` | — | The label. A change rolls to it. |
| `options` | | Roll options. Safe to pass inline — a new object identity never re-fires a roll. |
| `textStyle` | | Font styling. Cells are measured with it. |
| `style` | | Style for the row container. |
| `controllerRef` | | Ref receiving the imperative controller. |
| `revision` | | Change it to re-roll the *same* text. Pair with `skipUnchanged: false` for a full spin. |
| `restLayout` | `"text"` | `"text"` is cheapest at rest; `"slots"` keeps cells mounted. See below. |
| `warmupChars` | | Glyphs to measure at mount so the first roll starts instantly. |
| `respectReducedMotion` | `true` | Collapse rolls to instant swaps when the OS asks. |
| `textDirection` | `"ltr"` | Writing direction of the cell row. |
| `liveRegion` | `false` | Announce settled text to screen readers. |
| `accessibilityLabel` | `text` | |

### `restLayout`

- **`"text"`** — one plain `<Text>` at rest. Cheapest, and native kerning is
  preserved while the label sits still. The row re-flows into cells when a roll
  starts, so a kerning-heavy font shifts slightly at each end of a roll.
- **`"slots"`** — cells stay mounted. No re-flow, and repeat rolls reuse the
  views instead of remounting them. Costs one view per character at rest, and
  kerning is lost permanently.

`"slots"` for labels that animate often (counters, live values); `"text"` for
labels that rarely change. `SlotCounter` picks `"slots"` for you.

### `warmupChars`

A glyph can only roll once it's been measured, and measurement costs a layout
pass. The initial text is measured at mount — pass whatever else the label will
cycle through and the first roll starts on the same frame as every later one:

```tsx
<SlotText text={sortLabel} warmupChars="Recently addedLowest priceTop rated" />
```

## Example app

An interactive playground lives in [`example/`](./example) — every option as a
live control, the counter, all four presets, and the flash button:

```bash
pnpm install
pnpm --filter slot-text-native-example ios
```

It consumes the library straight from `src/`, so edits hot-reload without a
rebuild.

## How it works

One Reanimated shared value drives the whole label: a clock animated linearly
across the transition. Each cell derives its own slice of the stagger from that
clock inside its worklet, so a roll costs a **single animation** no matter how
long the text is.

That matters for more than allocation counts. A timer-driven stagger — one
`setTimeout` per letter — freezes on a half-swapped word the moment the JS
thread blocks on app work. Declaring the whole timeline up front and reading it
from a UI-thread clock means the wave finishes even when JavaScript doesn't.

Glyph widths come from a measured, per-style cache, so each cell resizes to the
exact width of the glyph arriving in it, eased so a wide outgoing glyph is
never cropped by a narrowing cell. Text is segmented with `Intl.Segmenter`, so
ZWJ emoji (👨‍👩‍👧) and combining marks stay in one cell.

Rolls are also capped globally: when a screen-wide data change retargets more
than 16 labels in one commit — a virtualized list re-sorting, say — the surplus
labels swap instantly instead of piling a measure-and-mount storm onto the JS
thread. The visible handful still roll; the rest just update.

## Font support

Works well with monospace fonts (every cell identical) and proportional
Latin/Cyrillic/Greek fonts including italics and glyphs with overhang.

Known tradeoffs, inherent to any per-character slot animation:

- **Kerning is lost while rolling.** Each glyph is its own box, so pairs like
  `AV` or `To` sit slightly looser. Invisible at UI label sizes.
- **Ligatures won't form** — `fi`, `fl` and coding ligatures stay separate.
- **Joined scripts are unsupported.** Arabic, Devanagari and other shaping
  scripts need contextual letterforms across the whole string.
- **Right-to-left text** needs `textDirection="auto"`; the default pins the row
  to LTR so Latin labels keep their order inside an RTL app.
- **Tall display fonts** may clip against the vertical roll mask. React Native
  has no per-axis overflow, so cells are widened by the tilt's horizontal reach
  and pulled back with a negative margin to keep that clip off the glyph.

Ideal for short labels, numbers, statuses and commands — in essentially any
font you'd use for those.

## Differences from the web `slot-text`

Same options and defaults, with four deliberate divergences:

1. **Grapheme-correct splitting.** The web build indexes by UTF-16 code unit;
   this one segments graphemes, so emoji and combining marks survive.
2. **Flash dwell starts after the entry roll settles**, not when `flash()` is
   called — a slow entry roll no longer eats into the dwell.
3. **Chromatic spread covers the target text**, not the longer of the two
   strings, so a shrinking label still lands a full sweep.
4. **`align` and `revision`** have no web equivalent.

## Credits

The animation this implements is Daniel Belyi's, from
[slot-text](https://www.npmjs.com/package/slot-text) — the clipped per-character
cell, the chasing entry, the springy settle, the per-letter wobble, the option
names and their defaults. This package ports that design to React Native and
adds the platform's missing pieces: glyph measurement, a UI-thread clock,
end-alignment and a counter preset.

This port is licensed under [Apache 2.0](./LICENSE), with attribution in
[NOTICE](./NOTICE). The original `slot-text` remains MIT licensed; its complete
copyright and permission notice ships in
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

The public GitHub mirror is [soundsystems/slot-text-native](https://github.com/soundsystems/slot-text-native).
Development and merge requests remain on [GitLab](https://gitlab.com/soundsystems/slot-text-native).

If this is useful to you, star [the original](https://www.npmjs.com/package/slot-text) too.
