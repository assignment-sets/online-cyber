export type PaymentOutcome = "SUCCESS" | "FAILED";

export type PaymentType = "advance" | "balance" | "full";

export interface CheckoutRequest {
  requestId: string;
  paymentType: PaymentType;
  amountPaise: number;
  currency: "INR";
  simulatedOutcome?: PaymentOutcome;
  metadata?: Record<string, unknown>;
}

export interface CheckoutResult {
  provider: string;
  providerRef: string;
  status: PaymentOutcome;
  amountPaise: number;
  completedAt: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  processOneTimeCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
}
