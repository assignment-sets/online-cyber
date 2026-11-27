/**
 * Formats byte sizes into a concise human-readable string (B, KB, MB).
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/jpg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};

/**
 * Maps common MIME types to readable file format labels for customer hints.
 */
export function formatAllowedMimeTypes(mimeTypes: string[] | undefined): string {
  if (!mimeTypes || mimeTypes.length === 0) {
    return "Any file";
  }

  const labels = Array.from(
    new Set(
      mimeTypes.map((mime) => {
        const normalized = mime.trim().toLowerCase();
        if (MIME_LABELS[normalized]) {
          return MIME_LABELS[normalized];
        }
        const subtype = normalized.split("/")[1];
        return subtype ? subtype.toUpperCase() : normalized;
      })
    )
  );

  return labels.join(", ");
}

/**
 * Formats an ISO timestamp string for display in customer tracking screens.
 */
export function formatTimestamp(isoString: string | null | undefined): string {
  if (!isoString) {
    return "—";
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Strips non-digit/plus characters for safe `tel:` URIs.
 */
export function toTelHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return `tel:${cleaned || phone.trim()}`;
}

/**
 * Extracts digits only for `https://wa.me/<number>` links.
 */
export function toWhatsAppHref(whatsapp: string): string {
  const digits = whatsapp.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}
