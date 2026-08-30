import { afterEach, describe, expect, it, jest } from "bun:test";
import { createRef, type ReactElement, StrictMode } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { SlotText } from "../slot-text";
import type { SlotTextController } from "../types";

const GLYPH = { height: 20, width: 10 };

/** Host elements are plain strings in the react-native test mock. */
const hostType = (node: ReactTestInstance) => node.type as unknown as string;

type Renderer = ReactTestRenderer;

const render = (element: ReactElement) => {
  let renderer: Renderer | undefined;
  act(() => {
    renderer = create(element);
  });
  return renderer as Renderer;
};

/** Fire onLayout for every sizer the measure pass currently renders. */
const measure = (renderer: Renderer, size = GLYPH) => {
  act(() => {
    const sizers = renderer.root.findAll(
      (node) => typeof node.props?.onLayout === "function"
    );
    for (const sizer of sizers) {
      sizer.props.onLayout({ nativeEvent: { layout: { ...size } } });
    }
    // The measure batch is committed on a single deferred flush.
    jest.advanceTimersByTime(1);
  });
};

const slotsOf = (renderer: Renderer) =>
  renderer.root.findAll((node) => hostType(node) === "AnimatedView");

const plainTextOf = (renderer: Renderer) =>
  renderer.root
    .findAll(
      (node) =>
        hostType(node) === "Text" && typeof node.props?.onLayout !== "function"
    )
    .map((node) => node.props.children)
    .join("");

const measuredChars = (renderer: Renderer) =>
  renderer.root
    .findAll((node) => typeof node.props?.onLayout === "function")
    .map((node) => node.props.children as string);

afterEach(() => {
  globalThis.__slotTextReducedMotion = false;
  jest.useRealTimers();
});

describe("SlotText", () => {
  it("renders the resting label as one plain Text", () => {
    jest.useFakeTimers();
    const renderer = render(<SlotText text="Copy" />);
    measure(renderer);

    expect(slotsOf(renderer)).toHaveLength(0);
    expect(plainTextOf(renderer)).toBe("Copy");
    expect(
      renderer.root.findAll((n) => hostType(n) === "View")[0]?.props
        .accessibilityLabel
    ).toBe("Copy");
  });

  it("measures the initial glyphs at mount so the first roll does not stall", () => {
    jest.useFakeTimers();
    const renderer = render(<SlotText text="ab" />);

    // The measure pass runs while the label is still at rest.
    expect(measuredChars(renderer).sort()).toEqual(["a", "b"]);
  });

  it("warms up glyphs the label has not shown yet", () => {
    jest.useFakeTimers();
    const renderer = render(<SlotText text="1" warmupChars="234" />);

    expect(measuredChars(renderer).sort()).toEqual(["1", "2", "3", "4"]);
  });

  it("rolls immediately when every glyph is already warm", () => {
    jest.useFakeTimers();
    const controllerRef = createRef<SlotTextController>();
    const renderer = render(
      <SlotText controllerRef={controllerRef} text="ab" warmupChars="xy" />
    );
    measure(renderer);

    act(() => {
      controllerRef.current?.set("xy", { skipUnchanged: false });
    });

    // No second measure pass, and the cells are already rolling.
    expect(measuredChars(renderer)).toEqual([]);
    expect(slotsOf(renderer)).toHaveLength(2);
  });

  it("holds the previous text until the new glyphs have been measured", () => {
    jest.useFakeTimers();
    const controllerRef = createRef<SlotTextController>();
    const renderer = render(
      <SlotText controllerRef={controllerRef} text="ab" />
    );
    measure(renderer);

    act(() => {
      controllerRef.current?.set("xy");
    });

    expect(slotsOf(renderer)).toHaveLength(0);
    expect(plainTextOf(renderer)).toBe("ab");
    expect(measuredChars(renderer).sort()).toEqual(["x", "y"]);

    measure(renderer);
    expect(slotsOf(renderer)).toHaveLength(2);
  });

  it("holds unchanged glyphs static while the rest roll", () => {
    jest.useFakeTimers();
    const controllerRef = createRef<SlotTextController>();
    const renderer = render(
      <SlotText controllerRef={controllerRef} text="Copy" warmupChars="ied" />
    );
    measure(renderer);

    act(() => {
      controllerRef.current?.set("Copied");
    });

    // C, o, p hold; y→i, ""→e, ""→d roll.
    expect(slotsOf(renderer)).toHaveLength(3);
  });

  it("starts the roll at its start pose before the clock is armed", () => {
    jest.useFakeTimers();
    const controllerRef = createRef<SlotTextController>();
    const renderer = render(
      <SlotText
        controllerRef={controllerRef}
        options={{ bounce: 0, direction: "down" }}
        text="a"
        warmupChars="b"
      />
    );
    measure(renderer);

    act(() => {
      controllerRef.current?.set("b");
    });

    const [slot] = slotsOf(renderer);
    const faces =
      slot?.findAll((node) => hostType(node) === "AnimatedText") ?? [];
    const [outgoing, incoming] = faces.map(
      (face) => face.props.style.at(-1).transform
    );

    // Outgoing glyph still at rest; incoming glyph parked one cell above.
    expect(outgoing).toEqual([{ translateY: 0 }, { rotateZ: "0deg" }]);
    expect(incoming).toEqual([{ translateY: -20 }, { rotateZ: "0deg" }]);
  });

  it("keeps the row's layout advance while widening the clip box", () => {
    jest.useFakeTimers();
    const controllerRef = createRef<SlotTextController>();
    const renderer = render(
      <SlotText
        controllerRef={controllerRef}
        options={{ bounce: 0.6 }}
        text="a"
        warmupChars="b"
      />
    );
    measure(renderer);

    act(() => {
      controllerRef.current?.set("b");
    });

    const style = slotsOf(renderer)[0]?.props.style;
    const flat = Object.assign({}, ...style.flat(Number.POSITIVE_INFINITY));
    // Cells are widened by the tilt's horizontal reach on both sides and
    // pulled back by the same amount, so the glyph advance is unchanged:
    // width - 2 * |marginHorizontal| must equal the measured glyph width.
    expect(flat.marginHorizontal).toBeLessThan(0);
    expect(flat.width + flat.marginHorizontal * 2).toBe(GLYPH.width);
    expect(flat.height).toBe(GLYPH.height);
    expect(flat.overflow).toBe("hidden");
  });

  it("leaves the clip box flush with the glyph when nothing tilts", () => {
    jest.useFakeTimers();
    const controllerRef = createRef<SlotTextController>();
    const renderer = render(
      <SlotText
        controllerRef={controllerRef}
        options={{ bounce: 0 }}
        text="a"
        warmupChars="b"
      />
    );
    measure(renderer);

    act(() => {
      controllerRef.current?.set("b");
    });

    const style = slotsOf(renderer)[0]?.props.style;
    const flat = Object.assign({}, ...style.flat(Number.POSITIVE_INFINITY));
    expect(flat.marginHorizontal).toBe(-0);
    expect(flat.width).toBe(GLYPH.width);
  });

  it("settles instantly when the OS asks for reduced motion", () => {
    jest.useFakeTimers();
    globalThis.__slotTextReducedMotion = true;
    const controllerRef = createRef<SlotTextController>();
    const renderer = render(
      <SlotText controllerRef={controllerRef} text="ab" warmupChars="xy" />
    );
    measure(renderer);

    act(() => {
      controllerRef.current?.set("xy");
    });

    expect(slotsOf(renderer)).toHaveLength(0);
    expect(plainTextOf(renderer)).toBe("xy");
    expect(controllerRef.current?.value).toBe("xy");
  });

  it("keeps per-glyph cells mounted at rest with restLayout slots", () => {
    jest.useFakeTimers();
    const renderer = render(<SlotText restLayout="slots" text="abc" />);
    measure(renderer);

    // Three resting cells, and no single collapsed Text for the whole label.
    expect(
      renderer.root.findAll(
        (node) => hostType(node) === "View" && node.props?.style?.length === 2
      )
    ).toHaveLength(3);
    expect(plainTextOf(renderer)).toBe("abc");
  });

  it("re-rolls unchanged text when the revision changes", () => {
    jest.useFakeTimers();
    const renderer = render(
      <SlotText options={{ skipUnchanged: false }} revision={1} text="ab" />
    );
    measure(renderer);

    act(() => {
      renderer.update(
        <SlotText options={{ skipUnchanged: false }} revision={2} text="ab" />
      );
    });

    expect(slotsOf(renderer)).toHaveLength(2);
  });

  it("does not re-fire a roll when the parent passes a fresh options object", () => {
    jest.useFakeTimers();
    const controllerRef = createRef<SlotTextController>();
    const renderer = render(
      <SlotText
        controllerRef={controllerRef}
        options={{}}
        text="ab"
        warmupChars="xy"
      />
    );
    measure(renderer);

    act(() => {
      controllerRef.current?.set("xy");
    });
    const startedAt = slotsOf(renderer)[0]?.props.style;

    act(() => {
      // A new inline object every render must not interrupt the running roll.
      renderer.update(
        <SlotText
          controllerRef={controllerRef}
          options={{}}
          text="ab"
          warmupChars="xy"
        />
      );
    });

    expect(controllerRef.current?.value).toBe("xy");
    expect(slotsOf(renderer)).toHaveLength(2);
    expect(slotsOf(renderer)[0]?.props.style).toEqual(startedAt);
  });

  it("pins the cell row to LTR so an RTL app cannot reverse the label", () => {
    jest.useFakeTimers();
    const renderer = render(<SlotText text="ab" />);
    const [row] = renderer.root.findAll((node) => hostType(node) === "View");

    expect(row?.props.style).toContainEqual({ direction: "ltr" });
  });

  it("inherits the writing direction when asked to", () => {
    jest.useFakeTimers();
    const renderer = render(<SlotText text="ab" textDirection="auto" />);
    const [row] = renderer.root.findAll((node) => hostType(node) === "View");

    expect(row?.props.style).not.toContainEqual({ direction: "ltr" });
  });

  it("recreates its controller during StrictMode effect replay", () => {
    jest.useFakeTimers();
    const controllerRef = createRef<SlotTextController>();

    act(() => {
      create(
        <StrictMode>
          <SlotText
            controllerRef={controllerRef}
            options={{ duration: 0 }}
            text="A"
          />
        </StrictMode>
      );
    });

    act(() => {
      controllerRef.current?.set("B", { duration: 0 });
    });

    expect(controllerRef.current?.value).toBe("B");
  });
});
