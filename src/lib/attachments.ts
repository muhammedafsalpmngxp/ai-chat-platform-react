import {
  formatBytes,
  kindOf,
  maxBytesFor,
  UPLOAD_LIMITS,
  type AttachmentKind,
} from "./attachment-limits";

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  /**
   * base64 for images/PDFs, the file's text for text files.
   * Kept in memory only: it is not saved to localStorage (too big), so after a
   * reload old attachments show as names and are no longer sent to the model.
   */
  data?: string;
  /** Small JPEG data URL for image previews (this one is saved). */
  thumbnail?: string;
}

/** What the server receives for each attachment. */
export interface WireAttachment {
  name: string;
  mimeType: string;
  kind: AttachmentKind;
  data: string;
}

const KIND_LABEL: Record<AttachmentKind, string> = { image: "Images", pdf: "PDFs", text: "Text files" };

/**
 * Check new files against the limits, given what's already attached.
 * Returns the files that fit and a message for each one that doesn't.
 */
export function checkFiles(current: Attachment[], files: File[]) {
  const accepted: File[] = [];
  const errors: string[] = [];
  let count = current.length;
  let total = current.reduce((sum, a) => sum + a.size, 0);

  for (const file of files) {
    const kind = kindOf(file.name, file.type);
    if (!kind) {
      errors.push(`“${file.name}” isn't supported. Use images, PDFs or text/code files.`);
      continue;
    }
    if (count >= UPLOAD_LIMITS.maxFiles) {
      errors.push(`You can attach up to ${UPLOAD_LIMITS.maxFiles} files per message.`);
      break;
    }
    const max = maxBytesFor(kind);
    if (file.size > max) {
      errors.push(`“${file.name}” is ${formatBytes(file.size)}. ${KIND_LABEL[kind]} can be up to ${formatBytes(max)}.`);
      continue;
    }
    if (file.size === 0) {
      errors.push(`“${file.name}” is empty.`);
      continue;
    }
    if (total + file.size > UPLOAD_LIMITS.maxMessageBytes) {
      errors.push(`Attachments can total up to ${formatBytes(UPLOAD_LIMITS.maxMessageBytes)} per message.`);
      continue;
    }
    accepted.push(file);
    count += 1;
    total += file.size;
  }
  return { accepted, errors: Array.from(new Set(errors)) };
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function makeThumbnail(file: File, size = 160): Promise<string | undefined> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  }
}

export async function readAttachment(file: File, id: string): Promise<Attachment> {
  const kind = kindOf(file.name, file.type)!;
  const mimeType = kind === "pdf" ? "application/pdf" : file.type || "text/plain";
  const base = { id, name: file.name, mimeType, size: file.size, kind };
  if (kind === "text") return { ...base, data: await file.text() };
  if (kind === "image") {
    const [data, thumbnail] = await Promise.all([readAsBase64(file), makeThumbnail(file)]);
    return { ...base, data, thumbnail };
  }
  return { ...base, data: await readAsBase64(file) };
}

/** Bytes an attachment adds to a request (base64 is ~4/3 of the file). */
const wireBytes = (a: Attachment) => (a.kind === "text" ? a.size : Math.ceil((a.size * 4) / 3));

/**
 * Prepare chat history for the server. Newest attachments are sent first;
 * once the request budget is used up, older ones become a short note instead.
 */
export function toWireMessages(messages: { role: "user" | "assistant"; content: string; attachments?: Attachment[] }[]) {
  let budget = UPLOAD_LIMITS.maxRequestBytes;
  const out = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const attachments: WireAttachment[] = [];
    const missing: string[] = [];
    for (const a of m.attachments ?? []) {
      const bytes = wireBytes(a);
      if (a.data && bytes <= budget) {
        budget -= bytes;
        attachments.push({ name: a.name, mimeType: a.mimeType, kind: a.kind, data: a.data });
      } else {
        missing.push(a.name);
      }
    }
    const note = missing.length
      ? `\n\n[Earlier attachment(s) no longer available: ${missing.join(", ")}]`
      : "";
    out.unshift({ role: m.role, content: m.content + note, attachments });
  }
  return out;
}
