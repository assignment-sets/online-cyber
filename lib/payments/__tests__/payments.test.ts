import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPaymentProvider, MockPaymentProvider } from "@/lib/payments";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("MockPaymentProvider", () => {
  it("exposes provider name 'mock'", () => {
    const provider = new MockPaymentProvider();
    expect(provider.name).toBe("mock");
  });

  it("deterministically returns SUCCESS by default and when simulatedOutcome is 'SUCCESS'", async () => {
    const provider = new MockPaymentProvider();

    const defaultResult = await provider.processOneTimeCheckout({
      requestId: "req-100",
      paymentType: "advance",
      amountPaise: 25000,
      currency: "INR",
      metadata: { token: "OC-1001" },
    });

    expect(defaultResult.provider).toBe("mock");
    expect(defaultResult.status).toBe("SUCCESS");
    expect(defaultResult.amountPaise).toBe(25000);
    expect(defaultResult.providerRef).toMatch(/^mock_pay_[0-9a-f-]{36}$/i);
    expect(Number.isNaN(Date.parse(defaultResult.completedAt))).toBe(false);
    expect(defaultResult.failureReason).toBeUndefined();
    expect(defaultResult.metadata).toEqual({ token: "OC-1001" });

    const explicitSuccess = await provider.processOneTimeCheckout({
      requestId: "req-101",
      paymentType: "full",
      amountPaise: 15000,
      currency: "INR",
      simulatedOutcome: "SUCCESS",
    });

    expect(explicitSuccess.status).toBe("SUCCESS");
    expect(explicitSuccess.providerRef).not.toBe(defaultResult.providerRef);
    expect(explicitSuccess.failureReason).toBeUndefined();
  });

  it("deterministically returns FAILED with a failureReason when simulatedOutcome is 'FAILED'", async () => {
    const provider = new MockPaymentProvider();

    const result = await provider.processOneTimeCheckout({
      requestId: "req-102",
      paymentType: "balance",
      amountPaise: 25000,
      currency: "INR",
      simulatedOutcome: "FAILED",
      metadata: { attempt: 2 },
    });

    expect(result.provider).toBe("mock");
    expect(result.status).toBe("FAILED");
    expect(result.amountPaise).toBe(25000);
    expect(result.providerRef).toMatch(/^mock_pay_[0-9a-f-]{36}$/i);
    expect(result.failureReason).toBe(
      "Simulated payment failure from Mock Payment Provider"
    );
    expect(result.metadata).toEqual({ attempt: 2 });
  });

  it("validates integer paise amounts, requestId, and INR currency", async () => {
    const provider = new MockPaymentProvider();

    await expect(
      provider.processOneTimeCheckout({
        requestId: "   ",
        paymentType: "full",
        amountPaise: 1000,
        currency: "INR",
      })
    ).rejects.toThrow(/non-empty requestId/);

    await expect(
      provider.processOneTimeCheckout({
        requestId: "req-1",
        paymentType: "full",
        amountPaise: 0,
        currency: "INR",
      })
    ).rejects.toThrow(/positive integer/);

    await expect(
      provider.processOneTimeCheckout({
        requestId: "req-1",
        paymentType: "full",
        amountPaise: -500,
        currency: "INR",
      })
    ).rejects.toThrow(/positive integer/);

    await expect(
      provider.processOneTimeCheckout({
        requestId: "req-1",
        paymentType: "full",
        amountPaise: 12.5,
        currency: "INR",
      })
    ).rejects.toThrow(/positive integer/);
  });
});

describe("getPaymentProvider", () => {
  it("returns MockPaymentProvider when PAYMENT_PROVIDER is unset, empty, or 'mock'", () => {
    delete process.env.PAYMENT_PROVIDER;
    expect(getPaymentProvider()).toBeInstanceOf(MockPaymentProvider);

    process.env.PAYMENT_PROVIDER = "   ";
    expect(getPaymentProvider()).toBeInstanceOf(MockPaymentProvider);

    process.env.PAYMENT_PROVIDER = "mock";
    expect(getPaymentProvider()).toBeInstanceOf(MockPaymentProvider);

    process.env.PAYMENT_PROVIDER = "MOCK";
    expect(getPaymentProvider()).toBeInstanceOf(MockPaymentProvider);
  });

  it("throws a clear error for unconfigured payment providers", () => {
    process.env.PAYMENT_PROVIDER = "razorpay";
    expect(() => getPaymentProvider()).toThrow(
      /Unsupported or unconfigured payment provider: "razorpay"/
    );
  });
});
