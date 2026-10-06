import { describe, expect, it } from "vitest";
import { bankText, months, setupSteps } from "./treasury";

const ready = {
  stripeConnected: true,
  manualPayouts: true,
  payoutInterval: "manual",
  banksListed: true,
  bankCount: 2,
  separateExpenseBank: true,
};

describe("treasury setup (owner 2026-10-05: profit and reserve)", () => {
  it("all done when Stripe keys are saved and payouts are manual", () => {
    expect(setupSteps(ready).every((s) => s.done)).toBe(true);
  });

  it("asks for Manual payouts while Stripe still pays out by itself", () => {
    const steps = setupSteps({
      ...ready,
      manualPayouts: false,
      payoutInterval: "daily",
    });
    const step = steps.find((s) => !s.done)!;
    expect(step.todo).toContain("Manual");
  });

  it("words banks and months", () => {
    expect(
      bankText(
        { id: "ba", label: "Chase", last4: "6789", isDefault: true },
        "—",
      ),
    ).toBe("Chase •••6789");
    expect(bankText(null, "Основной банк")).toBe("Основной банк");
    expect(months(0.5)).toBe("0,5 мес.");
    expect(months(null)).toBe("—");
  });
});
