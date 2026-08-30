# Changelog

## 0.1.0 — unreleased

First release. React Native port of
[slot-text](https://www.npmjs.com/package/slot-text).

- `SlotText` — slot-machine roll for arbitrary strings, driven by a single
  Reanimated clock so a roll costs one animation regardless of length.
- `SlotCounter` — counter preset: end-aligned cells, delta-driven direction,
  pre-measured digits, tabular figures, Intl formatting.
- Imperative controller with `set`, `flash`, `destroy` and interrupt/queue
  semantics.
- Grapheme-correct segmentation, per-style glyph measurement with warm-up,
  reduced-motion support, and an LTR-pinned cell row.
