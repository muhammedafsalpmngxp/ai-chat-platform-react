import { useCallback, useEffect, useRef, useState } from "react";

import { kindOf, UPLOAD_LIMITS } from "@/lib/attachment-limits";
import { checkFiles, readAttachment, type Attachment } from "@/lib/attachments";
import { newId } from "@/lib/storage";

export type PendingAttachment = Attachment & { loading?: boolean };

/** Files attached to the message being written, with limit checks and error messages. */
export function useAttachments() {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const errorTimer = useRef<number | undefined>(undefined);
  // Latest list, so rapid successive adds are checked against each other.
  const current = useRef<PendingAttachment[]>([]);
  useEffect(() => {
    current.current = attachments;
  }, [attachments]);

  const showErrors = useCallback((messages: string[]) => {
    setErrors(messages);
    window.clearTimeout(errorTimer.current);
    if (messages.length) errorTimer.current = window.setTimeout(() => setErrors([]), 6000);
  }, []);

  useEffect(() => () => window.clearTimeout(errorTimer.current), []);

  const addFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      const { accepted, errors } = checkFiles(current.current, files);
      showErrors(errors);
      if (!accepted.length) return;

      // Show placeholders right away, then fill them in as each file is read.
      const placeholders: PendingAttachment[] = accepted.map((f) => ({
        id: newId(),
        name: f.name,
        mimeType: f.type,
        size: f.size,
        kind: kindOf(f.name, f.type)!,
        loading: true,
      }));
      current.current = [...current.current, ...placeholders];
      setAttachments(current.current);

      accepted.forEach(async (file, i) => {
        const id = placeholders[i].id;
        try {
          const read = await readAttachment(file, id);
          setAttachments((list) => list.map((a) => (a.id === id ? read : a)));
        } catch {
          setAttachments((list) => list.filter((a) => a.id !== id));
          showErrors([`Couldn't read “${file.name}”.`]);
        }
      });
    },
    [showErrors],
  );

  const remove = useCallback((id: string) => {
    setAttachments((list) => list.filter((a) => a.id !== id));
  }, []);

  const clear = useCallback(() => {
    setAttachments([]);
    showErrors([]);
  }, [showErrors]);

  return {
    attachments,
    errors,
    addFiles,
    remove,
    clear,
    loading: attachments.some((a) => a.loading),
    full: attachments.length >= UPLOAD_LIMITS.maxFiles,
  };
}
