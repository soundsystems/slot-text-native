import { afterEach, describe, expect, it, jest } from "bun:test";
import type { ReactElement } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { SlotCounter } from "../slot-counter";

const hostType = (node: ReactTestInstance) => node.type as unknown as string;

const render = (element: ReactElement) => {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  return renderer as ReactTestRenderer;
};

const measure = (renderer: ReactTestRenderer) => {
  act(() => {
    for (const sizer of renderer.root.findAll(
      (node) => typeof node.props?.onLayout === "function"
    )) {
      sizer.props.onLayout({
        nativeEvent: { layout: { height: 20, width: 10 } },
      });
    }
    jest.advanceTimersByTime(1);
  });
};

const warmChars = (renderer: ReactTestRenderer) =>
  new Set(
    renderer.root
      .findAll((node) => typeof node.props?.onLayout === "function")
      .map((node) => node.props.children as string)
  );

const visibleText = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAll(
      (node) =>
        hostType(node) === "Text" && typeof node.props?.onLayout !== "function"
    )
    .map((node) => node.props.children)
    .join("")
    // Cells render spaces as NBSP so a gap cannot collapse inside a slot.
    .replaceAll("\u00A0", " ");

const incomingTranslateY = (renderer: ReactTestRenderer) => {
  const [cell] = renderer.root.findAll(
    (node) => hostType(node) === "AnimatedView"
  );
  const faces =
    cell?.findAll((node) => hostType(node) === "AnimatedText") ?? [];
  const incoming = faces.at(-1);
  return incoming?.props.style.at(-1).transform[0].translateY as number;
};

afterEach(() => {
  jest.useRealTimers();
});

describe("SlotCounter", () => {
  it("groups thousands with the locale separator", () => {
    jest.useFakeTimers();
    const renderer = render(<SlotCounter locale="en-US" value={1_234_567} />);
    measure(renderer);

    expect(visibleText(renderer)).toBe("1,234,567");
  });

  it("honours a different locale's separators", () => {
    jest.useFakeTimers();
    const renderer = render(<SlotCounter locale="de-DE" value={1_234_567} />);
    measure(renderer);

    expect(visibleText(renderer)).toBe("1.234.567");
  });

  it("renders affixes as part of the rolling label", () => {
    jest.useFakeTimers();
    const renderer = render(
      <SlotCounter
        locale="en-US"
        maximumFractionDigits={2}
        minimumFractionDigits={2}
        prefix="$"
        suffix=" USD"
        value={42.5}
      />
    );
    measure(renderer);

    expect(visibleText(renderer)).toBe("$42.50 USD");
  });

  it("accepts a custom formatter", () => {
    jest.useFakeTimers();
    const thousands = (input: number) => `${input / 1000}k`;
    const renderer = render(<SlotCounter format={thousands} value={12_000} />);
    measure(renderer);

    expect(visibleText(renderer)).toBe("12k");
  });

  it("warms every digit, separator and affix at mount", () => {
    jest.useFakeTimers();
    const renderer = render(
      <SlotCounter locale="en-US" prefix="$" value={7} />
    );
    const warm = warmChars(renderer);

    for (const char of "0123456789") {
      expect(warm.has(char)).toBe(true);
    }
    // Separators come from a sample format, not a guess.
    expect(warm.has(",")).toBe(true);
    expect(warm.has(".")).toBe(true);
    expect(warm.has("$")).toBe(true);
  });

  it("rolls upward when the value rises and downward when it falls", () => {
    jest.useFakeTimers();
    const renderer = render(<SlotCounter locale="en-US" value={1} />);
    measure(renderer);

    act(() => {
      renderer.update(<SlotCounter locale="en-US" value={2} />);
    });
    // "up" parks the incoming glyph below the cell (positive Y).
    expect(incomingTranslateY(renderer)).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(2000);
      renderer.update(<SlotCounter locale="en-US" value={1} />);
    });
    expect(incomingTranslateY(renderer)).toBeLessThan(0);
  });

  it("keeps the ones column still when the digit count changes", () => {
    jest.useFakeTimers();
    const renderer = render(<SlotCounter locale="en-US" value={99} />);
    measure(renderer);

    act(() => {
      renderer.update(<SlotCounter locale="en-US" value={100} />);
    });

    const cells = renderer.root.findAll(
      (node) => hostType(node) === "AnimatedView"
    );
    const incoming = cells.map((cell) => {
      const faces = cell.findAll((node) => hostType(node) === "AnimatedText");
      return faces.at(-1)?.props.children;
    });
    // A new cell opens on the left; the existing columns roll 9 -> 0 in place.
    expect(incoming).toEqual(["1", "0", "0"]);
  });

  it("applies tabular figures so digit cells share a width", () => {
    jest.useFakeTimers();
    const renderer = render(<SlotCounter value={1} />);
    const style = renderer.root.findAll((node) => hostType(node) === "Text")[0]
      ?.props.style;

    expect(JSON.stringify(style)).toContain("tabular-nums");
  });

  it("lets the caller override the counter defaults", () => {
    jest.useFakeTimers();
    const renderer = render(
      <SlotCounter
        locale="en-US"
        options={{ align: "start", direction: "down" }}
        value={99}
      />
    );
    measure(renderer);

    act(() => {
      renderer.update(
        <SlotCounter
          locale="en-US"
          options={{ align: "start", direction: "down" }}
          value={100}
        />
      );
    });

    const cells = renderer.root.findAll(
      (node) => hostType(node) === "AnimatedView"
    );
    const incoming = cells.map((cell) => {
      const faces = cell.findAll((node) => hostType(node) === "AnimatedText");
      return faces.at(-1)?.props.children;
    });
    // Start-aligned: the new cell opens on the right instead.
    expect(incoming).toEqual(["1", "0", "0"]);
    expect(incomingTranslateY(renderer)).toBeLessThan(0);
  });
});
