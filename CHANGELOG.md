# Changelog

## 0.1.0 — unreleased

First release. React Native port of
[slot-text](https://www.npmjs.com/package/slot-text) by Daniel Belyi.

- `SlotText` — slot-machine roll for arbitrary strings, driven by a single
  Reanimated clock so a roll costs one animation regardless of length.
- `SlotCounter` — counter preset: end-aligned cells, delta-driven direction,
  pre-measured digits, tabular figures, Intl formatting.
- `presets` — curated option sets: `snappy`, `calm`, `odometer`, `jackpot`.
- `align` option, with no web equivalent: `"end"` keeps the last character in
  the last cell, so a number growing a digit leaves the ones column alone.
- Imperative controller with `set`, `flash`, `destroy` and interrupt/queue
  semantics.
- A global cap on simultaneous rolls, so a screen-wide retarget costs a
  bounded number of visible animations instead of a measure-and-mount storm.
  Labels over the cap publish their new text immediately.
- Grapheme-correct segmentation, per-style glyph measurement with warm-up,
  reduced-motion support, and an LTR-pinned cell row.
