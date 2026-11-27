import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLoginForm } from "../admin-login-form";
import { AdminTerminal } from "../admin-terminal";
import { QueueTab } from "../queue-tab";

const pushMock = vi.fn<(href: string) => void>();
const refreshMock = vi.fn<() => void>();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Admin & Owner Terminal UI", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hides the Staff tab when staff.role is admin and shows it when staff.role is owner", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/admin/shop")) {
        return jsonResponse({
          shop: {
            id: 1,
            is_open: true,
            phone: "+91 9876543210",
            whatsapp: "+91 9876543210",
            email: "desk@onlinecyber.test",
            address: "Main Market Road",
            closed_notice: "Currently closed.",
            updated_at: "2026-11-26T10:00:00.000Z",
          },
        });
      }
      if (url.startsWith("/api/admin/requests")) {
        return jsonResponse({ requests: [] });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <AdminTerminal
        staff={{
          staffId: "staff-admin-1",
          username: "desk_admin",
          role: "admin",
        }}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText("onlineCyber Staff Terminal")
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("tab", { name: "Work Queue" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Services & Pricing" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Shop & Contact" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Payments & Tokens" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Staff" })
    ).not.toBeInTheDocument();

    rerender(
      <AdminTerminal
        staff={{
          staffId: "staff-owner-1",
          username: "shop_owner",
          role: "owner",
        }}
      />
    );

    expect(screen.getByRole("tab", { name: "Staff" })).toBeInTheDocument();
  });

  it("AdminLoginForm submits credentials, displays error alert on 401, and redirects on 200", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ error: "Invalid username or password." }, 401)
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            staff: {
              id: "staff-1",
              username: "owner1",
              role: "owner",
            },
          },
          200
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminLoginForm />);

    await user.type(screen.getByLabelText("Username"), "owner1");
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Invalid username or password."
      );
    });
    expect(pushMock).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "correctpass123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/admin");
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          username: "owner1",
          password: "correctpass123",
        }),
      })
    );
  });

  it("QueueTab Cancel dialog enforces a non-empty cancellation reason before calling the status endpoint", async () => {
    const user = userEvent.setup();
    const sampleRequest = {
      id: "req-101",
      token: "CYB-9042",
      service_id: "svc-1",
      service_snapshot: {
        name: "PAN Card Correction",
        isCollectibleOnline: false,
      },
      status: "PENDING",
      form_data: { full_name: "Aarav Sharma" },
      customer_phone: "+91 9876543210",
      customer_email: "aarav@example.com",
      customer_note: "Call before printing",
      total_amount_paise: 15000,
      advance_required_paise: 0,
      amount_paid_paise: 0,
      submitted_while_closed: false,
      cancellation_reason: null,
      storage_prefix: "requests/req-101",
      terminal_at: null,
      files_expire_at: null,
      files_purged_at: null,
      created_at: "2026-11-26T10:00:00.000Z",
      updated_at: "2026-11-26T10:00:00.000Z",
    };

    const statusPatchSpy = vi.fn<(body: unknown) => void>();

    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
        if (url === "/api/admin/requests") {
          return jsonResponse({ requests: [sampleRequest] });
        }
        if (url === "/api/admin/requests/req-101") {
          return jsonResponse({
            request: sampleRequest,
            inputFiles: [],
            outputFiles: [],
            payments: [],
          });
        }
        if (
          url === "/api/admin/requests/req-101/status" &&
          init?.method === "PATCH"
        ) {
          statusPatchSpy(JSON.parse(String(init.body)));
          return jsonResponse({
            request: {
              ...sampleRequest,
              status: "CANCELED",
              cancellation_reason: "Blurry scan uploaded",
            },
          });
        }
        return jsonResponse({});
      }
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<QueueTab />);

    await waitFor(() => {
      expect(screen.getByText("CYB-9042")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Inspect" }));

    await waitFor(() => {
      expect(screen.getByText("Token CYB-9042")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Cancel / Reject" })
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Cancel / Reject Request" })
      ).toBeInTheDocument();
    });

    // Submitting with empty reason must fail client-side validation and NOT hit PATCH /status
    await user.click(
      screen.getByRole("button", { name: "Confirm Cancellation" })
    );

    expect(
      screen.getByText("Cancellation reason must be at least 3 characters.")
    ).toBeInTheDocument();
    expect(statusPatchSpy).not.toHaveBeenCalled();

    // Entering a valid reason should call PATCH /api/admin/requests/req-101/status
    await user.type(
      screen.getByLabelText("Cancellation Reason"),
      "Blurry scan uploaded"
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm Cancellation" })
    );

    await waitFor(() => {
      expect(statusPatchSpy).toHaveBeenCalledWith({
        status: "CANCELED",
        cancellationReason: "Blurry scan uploaded",
      });
    });
  });

  it("QueueTab renders Initiated (Uploading) badge and disables workflow actions in RequestDetailSheet", async () => {
    const user = userEvent.setup();
    const initiatedRequest = {
      id: "req-init-1",
      token: null,
      service_id: "svc-1",
      service_snapshot: {
        name: "Passport Photo & Print",
        isCollectibleOnline: true,
      },
      status: "INITIATED",
      form_data: { full_name: "Priya Sen" },
      customer_phone: "+91 9876543210",
      customer_email: null,
      customer_note: null,
      total_amount_paise: 12000,
      advance_required_paise: 0,
      amount_paid_paise: 0,
      submitted_while_closed: false,
      cancellation_reason: null,
      storage_prefix: "requests/req-init-1",
      terminal_at: null,
      files_expire_at: "2026-11-27T10:00:00.000Z",
      files_purged_at: null,
      created_at: "2026-11-26T10:00:00.000Z",
      updated_at: "2026-11-26T10:00:00.000Z",
    };

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/admin/requests/req-init-1")) {
        return jsonResponse({
          request: initiatedRequest,
          inputFiles: [],
          outputFiles: [],
          payments: [],
        });
      }
      if (url.startsWith("/api/admin/requests")) {
        return jsonResponse({ requests: [initiatedRequest] });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QueueTab />);

    await waitFor(() => {
      expect(screen.getByText("Initiated (Uploading)")).toBeInTheDocument();
    });
    expect(screen.getByText("Uploading Files")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Inspect" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          /Customer started submitting this request; file uploads have not finalized yet\./i
        )
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("button", { name: "Start Work" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark Completed" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Upload Deliverable(s)")
    ).not.toBeInTheDocument();
  });
});
