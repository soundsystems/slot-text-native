# Contributing

Thanks for looking. This is a small, focused library — the bar for changes is
that they keep it small and focused.

## Setup

```bash
pnpm install     # also builds the package via `prepare`
pnpm test        # bun test, 70 tests
pnpm typecheck
pnpm lint        # biome + ultracite
pnpm build       # bob: commonjs + module + typescript
```

The example app is a separate workspace:

```bash
pnpm --filter slot-text-native-example ios
```

It consumes the library straight from `src/` through the `react-native` export
condition, so edits hot-reload with no rebuild.

## Things to know before changing the animation

A few invariants are load-bearing. Breaking them tends to look fine locally and
fail on a busy device:

- **One clock per label.** The whole staggered timeline is derived inside
  worklets from a single shared value. Do not add per-glyph `withTiming` calls
  — a wave scheduled from JS freezes mid-word when the thread is busy, which is
  the exact failure this design exists to avoid.
- **The transition plan is built once**, in `SlotTextMachine`, and handed to the
  renderer. Nothing downstream re-splits graphemes or re-derives timings.
- **No ref writes during render.** The component runs under React Compiler in
  consumer apps; a discarded render must not leave a ref mutated.
- **`destroy()` must settle.** The global roll cap is released through the
  settle path, so a teardown that skips it leaks the cap and silently disables
  animation app-wide. There is a test for this — keep it passing.

## Divergences from the web library

This is a port of [slot-text](https://www.npmjs.com/package/slot-text). Option
names, defaults and feel track upstream deliberately. If you change behaviour
that upstream also has, document it under "Differences from the web slot-text"
in the README, with the reason.

## Adding a preset

Presets live in `src/presets.ts` and are ordered subtle → showpiece, not
alphabetically. A preset is a plain `SlotOptions` object: no logic, nothing that
depends on runtime state. If it needs a conditional, it belongs in your app, not
here.

## Pull requests

Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before opening one.
CI runs the same four. Tests for behaviour changes are expected — the suite is
fast and the animation is easy to break in ways that only show up on device.
