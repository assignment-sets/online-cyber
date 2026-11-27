import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicService } from "@/lib/data/public";
import { DynamicServiceForm } from "../dynamic-service-form";
import { FileUploadField } from "../file-upload-field";
import { ServiceCatalog } from "../service-catalog";
import { TokenTracker, type TokenLookupResponse } from "../token-tracker";

const mockPush = vi.fn<(href: string) => void>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const SAMPLE_SERVICE: PublicService = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "bulk-color-printing",
  name: "Bulk Color Printing",
  description: "High-speed laser printing for documents and project reports.",
  isCollectibleOnline: false,
  basePricePaise: 5000, // ₹50.00
  estimatedTurnaround: "2 hours",
  displayOrder: 1,
  formSchema: [
    {
      key: "customer_name",
      label: "Full Name",
      type: "text",
      required: true,
      placeholder: "Enter your name",
    },
    {
      key: "page_count",
      label: "Number of Pages",
      type: "number",
      required: true,
      min: 1,
      max: 1000,
    },
    {
      key: "paper_finish",
      label: "Paper Finish",
      type: "select",
      required: true,
      options: ["Standard 80gsm", "Glossy 130gsm"],
    },
    {
      key: "spiral_binding",
      label: "Add Spiral Binding",
      type: "checkbox",
      required: false,
      helpText: "Includes transparent front cover",
    },
    {
      key: "notes_detail",
      label: "Formatting Instructions",
      type: "textarea",
      required: false,
    },
    {
      key: "document_pdf",
      label: "Document PDF",
      type: "file",
      required: false,
      allowedMimeTypes: ["application/pdf"],
      maxFileSizeBytes: 10 * 1024 * 1024,
      maxFiles: 5,
    },
  ],
  pricingRules: [
    {
      id: "rule_pages",
      label: "Per Page Print",
      type: "per_unit",
      fieldKey: "page_count",
      unitPricePaise: 500, // ₹5.00 per page
    },
    {
      id: "rule_finish",
      label: "Paper Upgrade",
      type: "option_surcharge",
      fieldKey: "paper_finish",
      optionSurchargesPaise: {
        "Standard 80gsm": 0,
        "Glossy 130gsm": 15000, // ₹150.00
      },
    },
    {
      id: "rule_binding",
      label: "Spiral Binding",
      type: "boolean_surcharge",
      fieldKey: "spiral_binding",
      surchargePaise: 4000, // ₹40.00
    },
  ],
};

function makeTokenResponse(
  overrides: Partial<TokenLookupResponse>
): TokenLookupResponse {
  return {
    token: "OC-7K9P3M",
    requestId: "22222222-2222-4222-8222-222222222222",
    serviceName: "Exam Form Fill-Up",
    isCollectibleOnline: true,
    status: "PENDING",
    submittedWhileClosed: false,
    totalAmountPaise: 30000,
    advanceRequiredPaise: 0,
    amountPaidPaise: 0,
    balanceDuePaise: 30000,
    cancellationReason: null,
    filesPurgedAt: null,
    createdAt: "2026-11-26T10:00:00.000Z",
    updatedAt: "2026-11-26T10:05:00.000Z",
    terminalAt: null,
    deliverables: [],
    ...overrides,
  };
}

describe("Storefront Phase 3B UI", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockPush.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("DynamicServiceForm", () => {
    it("renders fields from service.formSchema and reflects live pricing + >= ₹500 50% advance callout", async () => {
      const user = userEvent.setup();

      render(<DynamicServiceForm service={SAMPLE_SERVICE} shopIsOpen={true} />);

      expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Number of Pages/i)).toBeInTheDocument();
      expect(screen.getByText(/^Paper Finish/)).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: /Add Spiral Binding/i })
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText(/Formatting Instructions/i)
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/Document PDF/i)).toBeInTheDocument();

      // Base price ₹50.00 -> Standard Job < ₹500 (no advance callout shown)
      expect(
        screen.queryByText(/50% Advance Payment Required/i)
      ).not.toBeInTheDocument();
      expect(screen.getAllByText(/₹50\.00/).length).toBeGreaterThan(0);

      // Increase pages to 90 -> ₹50 + (90 * ₹5) = ₹500.00 -> Large Job >= ₹500
      const pagesInput = screen.getByLabelText(/Number of Pages/i);
      await user.type(pagesInput, "90");

      expect(
        screen.getByText(/Large Job ≥ ₹500: 50% Advance Payment Required/i)
      ).toBeInTheDocument();
      expect(screen.getAllByText(/₹500\.00/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/₹250\.00/).length).toBeGreaterThan(0);

      // Toggle Spiral Binding (+₹40.00) -> ₹540.00 total, ₹270.00 advance
      await user.click(
        screen.getByRole("checkbox", { name: /Add Spiral Binding/i })
      );
      expect(screen.getAllByText(/₹540\.00/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/₹270\.00/).length).toBeGreaterThan(0);
    });

    it("submits < ₹500 job, issues Work Token, and auto-copies to clipboard", async () => {
      const user = userEvent.setup();
      const writeTextSpy = vi
        .spyOn(navigator.clipboard, "writeText")
        .mockResolvedValue(undefined);
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "PENDING",
            requiresAdvance: false,
            requestId: "33333333-3333-4333-8333-333333333333",
            token: "OC-9M4K2P",
            totalAmountPaise: 10000,
            advanceRequiredPaise: 0,
            amountPaidPaise: 0,
            submittedWhileClosed: false,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        )
      );
      globalThis.fetch = fetchMock as typeof fetch;

      render(<DynamicServiceForm service={SAMPLE_SERVICE} shopIsOpen={true} />);

      await user.type(screen.getByLabelText(/Full Name/i), "Asha Devi");
      await user.type(screen.getByLabelText(/Number of Pages/i), "10");
      await user.type(screen.getByLabelText(/Phone Number/i), "9876543210");

      await user.click(
        screen.getByRole("button", { name: /Submit & Get Work Token/i })
      );

      await waitFor(() => {
        expect(screen.getByText("OC-9M4K2P")).toBeInTheDocument();
      });

      expect(writeTextSpy).toHaveBeenCalledWith("OC-9M4K2P");
      expect(
        screen.getByText(/Work Token copied to your clipboard!/i)
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Track Request Status/i })
      ).toHaveAttribute("href", "/track/OC-9M4K2P");
    });

    it("opens advance checkout for >= ₹500 job, handles failure retry, and issues token on success", async () => {
      const user = userEvent.setup();
      const writeTextSpy = vi
        .spyOn(navigator.clipboard, "writeText")
        .mockResolvedValue(undefined);
      const fetchMock = vi
        .fn<typeof fetch>()
        // 1. POST /api/requests -> DRAFT_AWAITING_ADVANCE
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: "DRAFT_AWAITING_ADVANCE",
              requiresAdvance: true,
              requestId: "44444444-4444-4444-8444-444444444444",
              token: null,
              totalAmountPaise: 55000,
              advanceRequiredPaise: 27500,
              amountPaidPaise: 0,
              submittedWhileClosed: false,
            }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          )
        )
        // 2. POST /api/payments/checkout -> 402 FAILED
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: "FAILED",
              error: "Mock payment failed (simulated decline).",
            }),
            { status: 402, headers: { "Content-Type": "application/json" } }
          )
        )
        // 3. POST /api/payments/checkout -> 200 SUCCESS
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: "SUCCESS",
              paymentRef: "mock_pay_123",
              token: "OC-5X8Q7N",
              requestStatus: "PENDING",
              totalAmountPaise: 55000,
              amountPaidPaise: 27500,
              balanceDuePaise: 27500,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      globalThis.fetch = fetchMock as typeof fetch;

      render(<DynamicServiceForm service={SAMPLE_SERVICE} shopIsOpen={true} />);

      await user.type(screen.getByLabelText(/Full Name/i), "Ravi Kumar");
      await user.type(screen.getByLabelText(/Number of Pages/i), "100");
      await user.type(screen.getByLabelText(/Phone Number/i), "9876543210");

      await user.click(
        screen.getByRole("button", { name: /Continue & Pay 50%/i })
      );

      await waitFor(() => {
        expect(
          screen.getByText(/50% Advance Payment Required/i, {
            selector: "[data-slot='dialog-title'] span, [data-slot='dialog-title']",
          })
        ).toBeInTheDocument();
      });

      // Simulate payment failure first
      await user.click(
        screen.getByRole("button", { name: /Simulate Payment Failure/i })
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Mock payment failed \(simulated decline\)\./i)
        ).toBeInTheDocument();
      });
      expect(screen.queryByText("OC-5X8Q7N")).not.toBeInTheDocument();

      // Retry with success
      await user.click(screen.getByRole("button", { name: /Pay ₹275\.00/i }));

      await waitFor(() => {
        expect(screen.getByText("OC-5X8Q7N")).toBeInTheDocument();
      });
      expect(writeTextSpy).toHaveBeenCalledWith("OC-5X8Q7N");
    });

    it("makes zero fetch calls when selecting files locally", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn<typeof fetch>();
      globalThis.fetch = fetchMock as typeof fetch;

      render(<DynamicServiceForm service={SAMPLE_SERVICE} shopIsOpen={true} />);

      const file1 = new File(["pdf-1"], "doc-one.pdf", {
        type: "application/pdf",
      });
      const file2 = new File(["pdf-2"], "doc-two.pdf", {
        type: "application/pdf",
      });
      const fileInput = screen.getByLabelText(/Document PDF/i);
      await user.upload(fileInput, [file1, file2]);

      expect(screen.getByText("doc-one.pdf")).toBeInTheDocument();
      expect(screen.getByText("doc-two.pdf")).toBeInTheDocument();
      expect(screen.getByText("2 / 5 selected")).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("surfaces 400 validation errors from POST /api/requests without making any R2 PUT calls", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "Validation failed",
            fieldErrors: {
              customer_name: ["Full Name is required."],
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      );
      globalThis.fetch = fetchMock as typeof fetch;

      render(<DynamicServiceForm service={SAMPLE_SERVICE} shopIsOpen={true} />);

      const file = new File(["pdf-1"], "doc-one.pdf", {
        type: "application/pdf",
      });
      await user.upload(screen.getByLabelText(/Document PDF/i), file);

      expect(fetchMock).toHaveBeenCalledTimes(0);

      await user.click(
        screen.getByRole("button", { name: /Submit & Get Work Token/i })
      );

      await waitFor(() => {
        expect(screen.getByText("Full Name is required.")).toBeInTheDocument();
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/requests",
        expect.objectContaining({ method: "POST" })
      );
      const putCalls = fetchMock.mock.calls.filter(
        ([, init]) => init?.method === "PUT"
      );
      expect(putCalls).toHaveLength(0);
    });

    it("submits < ₹500 job with files via INITIATED -> parallel PUTs -> finalize -> Work Token auto-copy", async () => {
      const user = userEvent.setup();
      const writeTextSpy = vi
        .spyOn(navigator.clipboard, "writeText")
        .mockResolvedValue(undefined);

      const requestId = "55555555-5555-4555-8555-555555555555";
      const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        if (url === "/api/requests" && init?.method === "POST") {
          const parsedBody = JSON.parse(String(init.body)) as {
            files: Array<{
              clientFileId: string;
              fieldKey: string;
              originalFilename: string;
              mimeType: string;
              sizeBytes: number;
            }>;
          };
          const uploadTargets = parsedBody.files.map((item, index) => ({
            ...item,
            storageKey: `requests/${requestId}/input/document_pdf/key-${index}-${item.originalFilename}`,
            uploadUrl: `https://r2.example.com/upload/${index}`,
          }));
          return new Response(
            JSON.stringify({
              status: "INITIATED",
              requiresAdvance: false,
              requestId,
              token: null,
              uploadTargets,
              totalAmountPaise: 10000,
              advanceRequiredPaise: 0,
              amountPaidPaise: 0,
              submittedWhileClosed: false,
            }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          );
        }

        if (
          url.startsWith("https://r2.example.com/upload/") &&
          init?.method === "PUT"
        ) {
          return new Response(null, { status: 200 });
        }

        if (
          url === `/api/requests/${requestId}/finalize` &&
          init?.method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              status: "PENDING",
              requiresAdvance: false,
              requestId,
              token: "OC-8T4W1Q",
              totalAmountPaise: 10000,
              advanceRequiredPaise: 0,
              amountPaidPaise: 0,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        throw new Error(`Unexpected fetch call: ${url}`);
      });
      globalThis.fetch = fetchMock as typeof fetch;

      render(<DynamicServiceForm service={SAMPLE_SERVICE} shopIsOpen={true} />);

      const file1 = new File(["a"], "part-1.pdf", { type: "application/pdf" });
      const file2 = new File(["b"], "part-2.pdf", { type: "application/pdf" });
      await user.upload(screen.getByLabelText(/Document PDF/i), [file1, file2]);
      await user.type(screen.getByLabelText(/Full Name/i), "Asha Devi");
      await user.type(screen.getByLabelText(/Number of Pages/i), "10");
      await user.type(screen.getByLabelText(/Phone Number/i), "9876543210");

      await user.click(
        screen.getByRole("button", { name: /Submit & Get Work Token/i })
      );

      await waitFor(() => {
        expect(screen.getByText("OC-8T4W1Q")).toBeInTheDocument();
      });

      expect(writeTextSpy).toHaveBeenCalledWith("OC-8T4W1Q");

      const putCalls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).startsWith("https://r2.example.com/upload/") &&
          init?.method === "PUT"
      );
      expect(putCalls).toHaveLength(2);

      const finalizeCalls = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url) === `/api/requests/${requestId}/finalize` &&
          init?.method === "POST"
      );
      expect(finalizeCalls).toHaveLength(1);
    });

    it("submits >= ₹500 job with files via INITIATED -> PUTs -> finalize -> MockCheckoutDialog failure retry -> Work Token", async () => {
      const user = userEvent.setup();
      const writeTextSpy = vi
        .spyOn(navigator.clipboard, "writeText")
        .mockResolvedValue(undefined);

      const requestId = "66666666-6666-4666-8666-666666666666";
      let checkoutAttempts = 0;

      const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        if (url === "/api/requests" && init?.method === "POST") {
          const parsedBody = JSON.parse(String(init.body)) as {
            files: Array<{
              clientFileId: string;
              fieldKey: string;
              originalFilename: string;
              mimeType: string;
              sizeBytes: number;
            }>;
          };
          const uploadTargets = parsedBody.files.map((item, index) => ({
            ...item,
            storageKey: `requests/${requestId}/input/document_pdf/key-${index}-${item.originalFilename}`,
            uploadUrl: `https://r2.example.com/upload-adv/${index}`,
          }));
          return new Response(
            JSON.stringify({
              status: "INITIATED",
              requiresAdvance: true,
              requestId,
              token: null,
              uploadTargets,
              totalAmountPaise: 55000,
              advanceRequiredPaise: 27500,
              amountPaidPaise: 0,
              submittedWhileClosed: false,
            }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          );
        }

        if (
          url.startsWith("https://r2.example.com/upload-adv/") &&
          init?.method === "PUT"
        ) {
          return new Response(null, { status: 200 });
        }

        if (
          url === `/api/requests/${requestId}/finalize` &&
          init?.method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              status: "DRAFT_AWAITING_ADVANCE",
              requiresAdvance: true,
              requestId,
              token: null,
              totalAmountPaise: 55000,
              advanceRequiredPaise: 27500,
              amountPaidPaise: 0,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        if (url === "/api/payments/checkout" && init?.method === "POST") {
          checkoutAttempts += 1;
          if (checkoutAttempts === 1) {
            return new Response(
              JSON.stringify({
                status: "FAILED",
                error: "Mock payment failed (simulated decline).",
              }),
              { status: 402, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({
              status: "SUCCESS",
              paymentRef: "mock_pay_456",
              token: "OC-2N6V9L",
              requestStatus: "PENDING",
              totalAmountPaise: 55000,
              amountPaidPaise: 27500,
              balanceDuePaise: 27500,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        throw new Error(`Unexpected fetch call: ${url}`);
      });
      globalThis.fetch = fetchMock as typeof fetch;

      render(<DynamicServiceForm service={SAMPLE_SERVICE} shopIsOpen={true} />);

      const file = new File(["big-pdf"], "thesis.pdf", {
        type: "application/pdf",
      });
      await user.upload(screen.getByLabelText(/Document PDF/i), file);
      await user.type(screen.getByLabelText(/Full Name/i), "Ravi Kumar");
      await user.type(screen.getByLabelText(/Number of Pages/i), "100");
      await user.type(screen.getByLabelText(/Phone Number/i), "9876543210");

      await user.click(
        screen.getByRole("button", { name: /Continue & Pay 50%/i })
      );

      await waitFor(() => {
        expect(
          screen.getByText(/50% Advance Payment Required/i, {
            selector:
              "[data-slot='dialog-title'] span, [data-slot='dialog-title']",
          })
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /Simulate Payment Failure/i })
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Mock payment failed \(simulated decline\)\./i)
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Pay ₹275\.00/i }));

      await waitFor(() => {
        expect(screen.getByText("OC-2N6V9L")).toBeInTheDocument();
      });
      expect(writeTextSpy).toHaveBeenCalledWith("OC-2N6V9L");
    });

    it("retries only failed R2 PUT targets on partial upload failure before finalizing", async () => {
      const user = userEvent.setup();
      vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

      const requestId = "77777777-7777-4777-8777-777777777777";
      let secondTargetAttempts = 0;

      const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        if (url === "/api/requests" && init?.method === "POST") {
          const parsedBody = JSON.parse(String(init.body)) as {
            files: Array<{
              clientFileId: string;
              fieldKey: string;
              originalFilename: string;
              mimeType: string;
              sizeBytes: number;
            }>;
          };
          const uploadTargets = parsedBody.files.map((item, index) => ({
            ...item,
            storageKey: `requests/${requestId}/input/document_pdf/key-${index}-${item.originalFilename}`,
            uploadUrl: `https://r2.example.com/upload-retry/${index}`,
          }));
          return new Response(
            JSON.stringify({
              status: "INITIATED",
              requiresAdvance: false,
              requestId,
              token: null,
              uploadTargets,
              totalAmountPaise: 10000,
              advanceRequiredPaise: 0,
              amountPaidPaise: 0,
              submittedWhileClosed: false,
            }),
            { status: 201, headers: { "Content-Type": "application/json" } }
          );
        }

        if (
          url === "https://r2.example.com/upload-retry/0" &&
          init?.method === "PUT"
        ) {
          return new Response(null, { status: 200 });
        }

        if (
          url === "https://r2.example.com/upload-retry/1" &&
          init?.method === "PUT"
        ) {
          secondTargetAttempts += 1;
          if (secondTargetAttempts === 1) {
            return new Response(null, { status: 503 });
          }
          return new Response(null, { status: 200 });
        }

        if (
          url === `/api/requests/${requestId}/finalize` &&
          init?.method === "POST"
        ) {
          return new Response(
            JSON.stringify({
              status: "PENDING",
              requiresAdvance: false,
              requestId,
              token: "OC-3R7P8K",
              totalAmountPaise: 10000,
              advanceRequiredPaise: 0,
              amountPaidPaise: 0,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        throw new Error(`Unexpected fetch call: ${url}`);
      });
      globalThis.fetch = fetchMock as typeof fetch;

      render(<DynamicServiceForm service={SAMPLE_SERVICE} shopIsOpen={true} />);

      const file1 = new File(["a"], "first.pdf", { type: "application/pdf" });
      const file2 = new File(["b"], "second.pdf", { type: "application/pdf" });
      await user.upload(screen.getByLabelText(/Document PDF/i), [file1, file2]);
      await user.type(screen.getByLabelText(/Full Name/i), "Meera Nair");
      await user.type(screen.getByLabelText(/Number of Pages/i), "10");
      await user.type(screen.getByLabelText(/Phone Number/i), "9876543210");

      await user.click(
        screen.getByRole("button", { name: /Submit & Get Work Token/i })
      );

      await waitFor(() => {
        expect(
          screen.getByText(
            /Some files failed to upload\. Click Retry Upload to finish submitting\./i
          )
        ).toBeInTheDocument();
      });

      expect(
        screen.getByRole("button", { name: /Retry Failed Uploads/i })
      ).toBeInTheDocument();

      // Should not have called finalize yet
      expect(
        fetchMock.mock.calls.filter(([url]) =>
          String(url).includes("/finalize")
        )
      ).toHaveLength(0);

      // Retry failed uploads -> should NOT re-call POST /api/requests and should ONLY PUT target 1
      await user.click(
        screen.getByRole("button", { name: /Retry Failed Uploads/i })
      );

      await waitFor(() => {
        expect(screen.getByText("OC-3R7P8K")).toBeInTheDocument();
      });

      const initiateCalls = fetchMock.mock.calls.filter(
        ([url, init]) => url === "/api/requests" && init?.method === "POST"
      );
      expect(initiateCalls).toHaveLength(1);

      const target0Puts = fetchMock.mock.calls.filter(
        ([url, init]) =>
          url === "https://r2.example.com/upload-retry/0" &&
          init?.method === "PUT"
      );
      const target1Puts = fetchMock.mock.calls.filter(
        ([url, init]) =>
          url === "https://r2.example.com/upload-retry/1" &&
          init?.method === "PUT"
      );
      expect(target0Puts).toHaveLength(1);
      expect(target1Puts).toHaveLength(2);
    });
  });

  describe("TokenTracker", () => {
    it("displays CANCELED reason and shows no download buttons", async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeTokenResponse({
              status: "CANCELED",
              cancellationReason:
                "Uploaded Aadhaar scan was unreadable; please re-upload a clear copy.",
              balanceDuePaise: 0,
              deliverables: [],
            })
          ),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      ) as typeof fetch;

      render(
        <TokenTracker
          initialToken="OC-7K9P3M"
          shopAddress="Main Market Road"
          shopPhone="+91 98765 43210"
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Request Canceled")).toBeInTheDocument();
      });

      expect(
        screen.getByText(
          /Uploaded Aadhaar scan was unreadable; please re-upload a clear copy\./i
        )
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /Download/i })
      ).not.toBeInTheDocument();
    });

    it("hides downloads when COMPLETED but balanceDuePaise > 0, and unlocks downloads after paying balance", async () => {
      const user = userEvent.setup();
      const fetchMock = vi
        .fn<typeof fetch>()
        // Initial token fetch: COMPLETED with ₹150 due
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify(
              makeTokenResponse({
                status: "COMPLETED",
                isCollectibleOnline: true,
                totalAmountPaise: 30000,
                amountPaidPaise: 15000,
                balanceDuePaise: 15000,
                deliverables: [],
              })
            ),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
        // Balance checkout success
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: "SUCCESS",
              paymentRef: "mock_bal_999",
              token: "OC-7K9P3M",
              requestStatus: "COMPLETED",
              totalAmountPaise: 30000,
              amountPaidPaise: 30000,
              balanceDuePaise: 0,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
        // Refresh token fetch: COMPLETED & fully paid with deliverable
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify(
              makeTokenResponse({
                status: "COMPLETED",
                isCollectibleOnline: true,
                totalAmountPaise: 30000,
                amountPaidPaise: 30000,
                balanceDuePaise: 0,
                deliverables: [
                  {
                    id: "file-1",
                    filename: "confirmation-receipt.pdf",
                    mimeType: "application/pdf",
                    sizeBytes: 245760,
                    downloadUrl: "https://r2.example.com/signed-receipt.pdf",
                  },
                ],
              })
            ),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      globalThis.fetch = fetchMock as typeof fetch;

      render(<TokenTracker initialToken="OC-7K9P3M" />);

      await waitFor(() => {
        expect(
          screen.getByText(/Work Completed — Balance Payment Required/i)
        ).toBeInTheDocument();
      });

      // Downloads are hidden while balance > 0
      expect(
        screen.queryByRole("link", { name: /Download/i })
      ).not.toBeInTheDocument();

      // Open balance checkout dialog and pay
      await user.click(
        screen.getByRole("button", { name: /Pay Remaining Balance/i })
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Pay ₹150\.00/i })
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Pay ₹150\.00/i }));

      await waitFor(() => {
        expect(
          screen.getByText("confirmation-receipt.pdf")
        ).toBeInTheDocument();
      });

      const downloadLink = screen.getByRole("link", { name: /Download/i });
      expect(downloadLink).toHaveAttribute(
        "href",
        "https://r2.example.com/signed-receipt.pdf"
      );
    });

    it("shows downloads immediately when COMPLETED + paid + isCollectibleOnline === true", async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeTokenResponse({
              status: "COMPLETED",
              isCollectibleOnline: true,
              totalAmountPaise: 20000,
              amountPaidPaise: 20000,
              balanceDuePaise: 0,
              deliverables: [
                {
                  id: "file-2",
                  filename: "admit-card.pdf",
                  mimeType: "application/pdf",
                  sizeBytes: 102400,
                  downloadUrl: "https://r2.example.com/admit-card.pdf",
                },
              ],
            })
          ),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      ) as typeof fetch;

      render(<TokenTracker initialToken="OC-7K9P3M" />);

      await waitFor(() => {
        expect(screen.getByText("admit-card.pdf")).toBeInTheDocument();
      });

      expect(
        screen.getByRole("link", { name: /Download/i })
      ).toHaveAttribute("href", "https://r2.example.com/admit-card.pdf");
    });

    it("shows physical pickup message without downloads when COMPLETED + paid + isCollectibleOnline === false", async () => {
      globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            makeTokenResponse({
              serviceName: "Bulk Color Printing",
              status: "COMPLETED",
              isCollectibleOnline: false,
              totalAmountPaise: 20000,
              amountPaidPaise: 20000,
              balanceDuePaise: 0,
              deliverables: [],
            })
          ),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      ) as typeof fetch;

      render(
        <TokenTracker
          initialToken="OC-7K9P3M"
          shopAddress="Shop 12, Station Market, Near Bus Stand"
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText(/Ready for Physical Pickup/i)
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Shop 12, Station Market, Near Bus Stand/i)
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /Download/i })
      ).not.toBeInTheDocument();
    });

    it("renders accurate tiered retention notice when filesPurgedAt is set for CANCELED vs COMPLETED", async () => {
      globalThis.fetch = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify(
              makeTokenResponse({
                status: "CANCELED",
                cancellationReason: "Missing page 2",
                filesPurgedAt: "2026-11-27T12:00:00.000Z",
                balanceDuePaise: 0,
              })
            ),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify(
              makeTokenResponse({
                status: "COMPLETED",
                isCollectibleOnline: true,
                totalAmountPaise: 20000,
                amountPaidPaise: 20000,
                balanceDuePaise: 0,
                filesPurgedAt: "2026-12-10T12:00:00.000Z",
              })
            ),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        ) as typeof fetch;

      const { unmount } = render(<TokenTracker initialToken="OC-7K9P3M" />);

      await waitFor(() => {
        expect(
          screen.getByText(
            /Files uploaded for canceled requests are automatically purged after 24 hours\./i
          )
        ).toBeInTheDocument();
      });

      unmount();

      render(<TokenTracker initialToken="OC-7K9P3M" />);

      await waitFor(() => {
        expect(
          screen.getByText(
            /Deliverables and uploaded files are automatically purged 14 days after completion\./i
          )
        ).toBeInTheDocument();
      });
    });
  });

  describe("ServiceCatalog & Mobile Progressive Disclosure", () => {
    const SECOND_SERVICE: PublicService = {
      ...SAMPLE_SERVICE,
      id: "22222222-2222-4222-8222-222222222222",
      slug: "resume-formatting",
      name: "Resume & Document Formatting",
      description: "ATS-ready resume layout delivered digitally.",
      isCollectibleOnline: true,
      basePricePaise: 20000,
      estimatedTurnaround: "Same day",
      displayOrder: 2,
    };

    it("previews selected service, filters in the picker sheet, and switches preview on selection", async () => {
      const user = userEvent.setup();
      render(<ServiceCatalog services={[SAMPLE_SERVICE, SECOND_SERVICE]} />);

      // Preview shows the first service and its Start Request link
      expect(
        screen.getAllByText("Bulk Color Printing").length
      ).toBeGreaterThan(0);
      const startLinks = screen.getAllByRole("link", { name: /Start Request/i });
      expect(startLinks[0]).toHaveAttribute(
        "href",
        "/services/bulk-color-printing"
      );

      // Open searchable mobile picker sheet
      await user.click(
        screen.getByRole("button", { name: /Bulk Color Printing.*Change/i })
      );

      expect(screen.getByText("Select a Service")).toBeInTheDocument();

      // Filter by fulfillment type
      await user.click(
        screen.getByRole("button", { name: "Digital delivery" })
      );

      // Search inside picker sheet
      const dialogSearch = screen
        .getAllByLabelText("Search services")
        .find((el) => el.closest('[role="dialog"]') !== null);
      expect(dialogSearch).toBeDefined();
      await user.type(dialogSearch!, "Resume");

      // Select the matched service from the sheet list
      const optionButton = screen
        .getAllByRole("button")
        .find(
          (btn) =>
            btn.closest('[role="dialog"]') !== null &&
            btn.textContent?.includes("Resume & Document Formatting")
        );
      expect(optionButton).toBeDefined();
      await user.click(optionButton!);

      // Preview updates to Resume & Document Formatting
      const updatedStartLinks = screen.getAllByRole("link", {
        name: /Start Request/i,
      });
      expect(updatedStartLinks[0]).toHaveAttribute(
        "href",
        "/services/resume-formatting"
      );
    });

    it("validates required Step 1 fields before advancing via Continue and jumps back on server fieldErrors", async () => {
      const user = userEvent.setup();
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "Validation failed",
            fieldErrors: {
              customer_name: ["Full Name must be at least 2 characters."],
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      );
      globalThis.fetch = fetchMock as typeof fetch;

      render(<DynamicServiceForm service={SAMPLE_SERVICE} shopIsOpen={true} />);

      expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument();

      // Clicking Continue without required fields stays on Step 1 and marks invalid
      await user.click(screen.getByRole("button", { name: /Continue$/i }));
      expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument();
      expect(screen.getByText("Full Name is required.")).toBeInTheDocument();

      // Fill required Step 1 fields (and select Paper Finish)
      await user.type(screen.getByLabelText(/Full Name/i), "A");
      await user.type(screen.getByLabelText(/Number of Pages/i), "5");
      await user.click(screen.getByRole("combobox", { name: /Paper Finish/i }));
      await user.click(
        screen.getByRole("option", { name: "Standard 80gsm" })
      );

      // Advance Step 1 -> Step 2 -> Step 3
      await user.click(screen.getByRole("button", { name: /Continue$/i }));
      expect(screen.getByText(/Step 2 of 3/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Continue$/i }));
      expect(screen.getByText(/Step 3 of 3/i)).toBeInTheDocument();

      // Server returns fieldError for customer_name (Step 1) -> jumps back to Step 1
      await user.click(
        screen.getByRole("button", { name: /Submit & Get Work Token/i })
      );

      await waitFor(() => {
        expect(
          screen.getByText("Full Name must be at least 2 characters.")
        ).toBeInTheDocument();
      });
      expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument();
    });

    it("hides multi-file counter when maxFiles === 1, deduplicates description, and supports file upload", async () => {
      const user = userEvent.setup();
      const onFilesChange = vi.fn<(next: unknown[]) => void>();

      render(
        <FileUploadField
          field={{
            key: "aadhaar_card",
            label: "Aadhaar Card",
            type: "file",
            required: true,
            helpText: "PDF, JPG, or PNG up to 5 MB",
            allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
            maxFileSizeBytes: 5 * 1024 * 1024,
            maxFiles: 1,
          }}
          files={[]}
          onFilesChange={onFilesChange}
        />
      );

      expect(screen.queryByText(/0 \/ 1 selected/i)).not.toBeInTheDocument();
      expect(
        screen.getByText("PDF, JPG, or PNG up to 5 MB")
      ).toBeInTheDocument();
      expect(screen.queryByText(/Allowed:/i)).not.toBeInTheDocument();

      const file = new File(["img"], "aadhaar.png", { type: "image/png" });
      await user.upload(screen.getByLabelText(/Aadhaar Card/i), file);
      expect(onFilesChange).toHaveBeenCalledTimes(1);
    });
  });
});
