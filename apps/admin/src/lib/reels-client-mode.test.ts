import { describe, expect, it } from "vitest";
import {
  REELS_CLIENT_FLAG,
  REELS_CLIENT_MODES,
  REELS_CLIENT_PAID_FLAG,
  reelsClientMode,
  reelsClientModeWrites,
} from "./reels-client-mode";

/** Owner 2026-11-04 (R-398): one three-way choice over two flags. */
describe("reelsClientMode", () => {
  it("reads the three modes from the two flags", () => {
    expect(reelsClientMode({})).toBe("off");
    expect(reelsClientMode({ [REELS_CLIENT_PAID_FLAG]: true })).toBe("off");
    expect(reelsClientMode({ [REELS_CLIENT_FLAG]: true })).toBe("free");
    expect(
      reelsClientMode({ [REELS_CLIENT_FLAG]: true, [REELS_CLIENT_PAID_FLAG]: true }),
    ).toBe("badge");
  });

  it("has exactly three Russian labels", () => {
    expect(REELS_CLIENT_MODES.map((m) => m.label)).toEqual([
      "Выключено",
      "Бесплатно всем",
      "Только с галочкой",
    ]);
  });
});

describe("reelsClientModeWrites", () => {
  it("off → badge narrows first, then opens the gate", () => {
    expect(reelsClientModeWrites("badge", {})).toEqual([
      { key: REELS_CLIENT_PAID_FLAG, enabled: true },
      { key: REELS_CLIENT_FLAG, enabled: true },
    ]);
  });

  it("badge → free drops only the narrowing", () => {
    expect(
      reelsClientModeWrites("free", {
        [REELS_CLIENT_FLAG]: true,
        [REELS_CLIENT_PAID_FLAG]: true,
      }),
    ).toEqual([{ key: REELS_CLIENT_PAID_FLAG, enabled: false }]);
  });

  it("free → off closes the gate only", () => {
    expect(reelsClientModeWrites("off", { [REELS_CLIENT_FLAG]: true })).toEqual([
      { key: REELS_CLIENT_FLAG, enabled: false },
    ]);
  });

  it("writes nothing when the mode is already set", () => {
    expect(reelsClientModeWrites("off", {})).toEqual([]);
    expect(
      reelsClientModeWrites("badge", {
        [REELS_CLIENT_FLAG]: true,
        [REELS_CLIENT_PAID_FLAG]: true,
      }),
    ).toEqual([]);
  });

  it("round-trips: every mode written is the mode read back", () => {
    for (const { value } of REELS_CLIENT_MODES) {
      const flags: Record<string, boolean> = { [REELS_CLIENT_FLAG]: true };
      for (const w of reelsClientModeWrites(value, flags)) flags[w.key] = w.enabled;
      expect(reelsClientMode(flags)).toBe(value);
    }
  });
});
