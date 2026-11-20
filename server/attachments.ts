import { HumanMessage, type ContentBlock } from "@langchain/core/messages";

import {
  formatBytes,
  IMAGE_TYPES,
  maxBytesFor,
  PDF_TYPE,
  UPLOAD_LIMITS,
  type AttachmentKind,
} from "../src/lib/attachment-limits";

export interface IncomingAttachment {
  name: string;
  mimeType: string;
  kind: AttachmentKind;
  data: string;
}

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Decoded size of the attachment's data, in bytes. */
function sizeOf(a: IncomingAttachment): number {
  if (a.kind === "text") return Buffer.byteLength(a.data, "utf8");
  const padding = a.data.endsWith("==") ? 2 : a.data.endsWith("=") ? 1 : 0;
  return Math.floor((a.data.length * 3) / 4) - padding;
}

/** Enforce the same limits as the browser, so a modified client can't bypass them. */
export function validateAttachments(messages: { role: string; attachments?: IncomingAttachment[] }[]) {
  let requestBytes = 0;
  for (const m of messages) {
    const list = m.attachments ?? [];
    if (!list.length) continue;
    if (m.role !== "user") throw new UploadError("Only user messages can have attachments.");
    if (list.length > UPLOAD_LIMITS.maxFiles) {
      throw new UploadError(`Up to ${UPLOAD_LIMITS.maxFiles} files per message.`);
    }
    let messageBytes = 0;
    for (const a of list) {
      if (typeof a?.data !== "string" || typeof a.name !== "string") {
        throw new UploadError("Malformed attachment.");
      }
      const typeOk =
        (a.kind === "image" && IMAGE_TYPES.includes(a.mimeType)) ||
        (a.kind === "pdf" && a.mimeType === PDF_TYPE) ||
        a.kind === "text";
      if (!typeOk) throw new UploadError(`“${a.name}” isn't a supported file type.`);
      const bytes = sizeOf(a);
      if (bytes > maxBytesFor(a.kind)) {
        throw new UploadError(`“${a.name}” is over ${formatBytes(maxBytesFor(a.kind))}.`, 413);
      }
      messageBytes += bytes;
      requestBytes += a.kind === "text" ? bytes : a.data.length;
    }
    if (messageBytes > UPLOAD_LIMITS.maxMessageBytes) {
      throw new UploadError(`Attachments can total up to ${formatBytes(UPLOAD_LIMITS.maxMessageBytes)} per message.`, 413);
    }
  }
  // Small allowance over the client budget for base64 rounding.
  if (requestBytes > UPLOAD_LIMITS.maxRequestBytes * 1.05) {
    throw new UploadError("This chat has too many attached files. Start a new chat to attach more.", 413);
  }
}

/** Build a user message: attached files first, then the typed text. */
export function userMessage(text: string, attachments: IncomingAttachment[] = []): HumanMessage {
  if (!attachments.length) return new HumanMessage(text);

  const blocks: ContentBlock[] = attachments.map((a): ContentBlock => {
    if (a.kind === "text") {
      return { type: "text", text: `<file name="${a.name}">\n${a.data}\n</file>` };
    }
    // LangChain base64 data blocks — ChatAnthropic and ChatOpenAI both convert these.
    return {
      type: a.kind === "image" ? "image" : "file",
      source_type: "base64",
      mime_type: a.mimeType,
      data: a.data,
      metadata: { filename: a.name },
    } as unknown as ContentBlock;
  });
  if (text.trim()) blocks.push({ type: "text", text });
  return new HumanMessage({ content: blocks });
}
