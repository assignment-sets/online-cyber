import { MockPaymentProvider } from "./mock-provider";
import type { PaymentProvider } from "./types";

export type {
  CheckoutRequest,
  CheckoutResult,
  PaymentOutcome,
  PaymentProvider,
  PaymentType,
} from "./types";
export { MockPaymentProvider } from "./mock-provider";

/**
 * Resolves the configured PaymentProvider based on PAYMENT_PROVIDER env var.
 * Defaults to "mock" when PAYMENT_PROVIDER is unset or empty.
 */
export function getPaymentProvider(): PaymentProvider {
  const raw = process.env.PAYMENT_PROVIDER?.trim();
  const providerName = raw ? raw.toLowerCase() : "mock";

  switch (providerName) {
    case "mock":
      return new MockPaymentProvider();
    default:
      throw new Error(
        `Unsupported or unconfigured payment provider: "${providerName}". Supported providers: mock.`
      );
  }
}
