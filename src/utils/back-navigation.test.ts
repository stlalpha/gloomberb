import { describe, expect, test } from "bun:test";
import {
  isBackNavigationKey,
  isDetailBackNavigationKey,
} from "./back-navigation";

describe("back navigation keys", () => {
  test("keeps global back navigation distinct from detail page back", () => {
    expect(isBackNavigationKey({ name: "escape" })).toBe(true);
    expect(isBackNavigationKey({ name: "backspace" })).toBe(true);

    expect(isDetailBackNavigationKey({ name: "escape" })).toBe(false);
    expect(isDetailBackNavigationKey({ name: "esc" })).toBe(false);
    expect(isDetailBackNavigationKey({ name: "backspace" })).toBe(true);
  });

  test("ignores modified backspace for detail page back", () => {
    expect(isDetailBackNavigationKey({ name: "backspace", ctrl: true }))
      .toBe(false);
    expect(isDetailBackNavigationKey({ name: "backspace", meta: true }))
      .toBe(false);
    expect(isDetailBackNavigationKey({ name: "backspace", option: true }))
      .toBe(false);
    expect(isDetailBackNavigationKey({ name: "backspace", shift: true }))
      .toBe(false);
  });
});
