// Upload rules, shared by the browser (to explain problems early) and the
// server (to enforce them).

export type AttachmentKind = "image" | "pdf" | "text";

export const UPLOAD_LIMITS = {
  /** Files per message. */
  maxFiles: 5,
  /** Per-file size caps, in bytes. */
  maxImageBytes: 5 * 1024 * 1024, // provider image limit
  maxPdfBytes: 10 * 1024 * 1024,
  maxTextBytes: 1 * 1024 * 1024,
  /** All files in one message together. */
  maxMessageBytes: 20 * 1024 * 1024,
  /** Attachment data resent with one request (whole chat history). Older files beyond this are dropped. */
  maxRequestBytes: 25 * 1024 * 1024,
} as const;

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const PDF_TYPE = "application/pdf";

/** Plain-text formats the model can read directly. Matched by extension, since browsers often report no MIME type. */
export const TEXT_EXTENSIONS = [
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "html", "htm", "css", "scss",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "java", "kt", "go", "rs", "rb", "php",
  "c", "h", "cpp", "hpp", "cs", "swift", "sql", "yaml", "yml", "toml", "ini",
  "sh", "ps1", "bat", "log",
];

/** Value for the file picker's `accept` attribute. */
export const ACCEPT = [...IMAGE_TYPES, PDF_TYPE, ...TEXT_EXTENSIONS.map((e) => "." + e)].join(",");

export function kindOf(name: string, mimeType: string): AttachmentKind | null {
  if (IMAGE_TYPES.includes(mimeType)) return "image";
  if (mimeType === PDF_TYPE || name.toLowerCase().endsWith(".pdf")) return "pdf";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (TEXT_EXTENSIONS.includes(ext) || mimeType.startsWith("text/")) return "text";
  return null;
}

export function maxBytesFor(kind: AttachmentKind): number {
  if (kind === "image") return UPLOAD_LIMITS.maxImageBytes;
  if (kind === "pdf") return UPLOAD_LIMITS.maxPdfBytes;
  return UPLOAD_LIMITS.maxTextBytes;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
}
