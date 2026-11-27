import type {
  CheckoutRequest,
  CheckoutResult,
  PaymentOutcome,
  PaymentProvider,
} from "./types";

const DEFAULT_FAILURE_REASON =
  "Simulated payment failure from Mock Payment Provider";

/**
 * Deterministic mock payment provider for one-time checkout simulation.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async processOneTimeCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    if (!req.requestId || req.requestId.trim() === "") {
      throw new Error("Checkout request requires a non-empty requestId.");
    }

    if (!Number.isInteger(req.amountPaise) || req.amountPaise <= 0) {
      throw new Error(
        "Checkout request amountPaise must be a positive integer."
      );
    }

    if (req.currency !== "INR") {
      throw new Error(`Unsupported currency "${req.currency}". Expected "INR".`);
    }

    const status: PaymentOutcome = req.simulatedOutcome ?? "SUCCESS";
    const providerRef = `mock_pay_${crypto.randomUUID()}`;
    const completedAt = new Date().toISOString();

    if (status === "FAILED") {
      return {
        provider: this.name,
        providerRef,
        status: "FAILED",
        amountPaise: req.amountPaise,
        completedAt,
        failureReason: DEFAULT_FAILURE_REASON,
        ...(req.metadata !== undefined ? { metadata: req.metadata } : {}),
      };
    }

    return {
      provider: this.name,
      providerRef,
      status: "SUCCESS",
      amountPaise: req.amountPaise,
      completedAt,
      ...(req.metadata !== undefined ? { metadata: req.metadata } : {}),
    };
  }
}
