// biome-ignore lint/performance/noBarrelFile: This file is the public package entrypoint.
export { SlotCounter } from "./slot-counter";
export { SlotText, useSlotTextController } from "./slot-text";
export type {
  ChromaticOptions,
  FlashOptions,
  SlotAlign,
  SlotColor,
  SlotCounterProps,
  SlotDirection,
  SlotOptions,
  SlotRestLayout,
  SlotTextController,
  SlotTextControllerRef,
  SlotTextProps,
} from "./types";
export { chromatic, splitGraphemes } from "./utils";
