/** One event from an NDJSON stream sent by this app's server (/api/askdata/ask). */
export type StreamEvent = { type: string } & Record<string, unknown>;

/**
 * Read an NDJSON response line by line, calling `onEvent` for each event.
 * Throws with the server's message if the request failed.
 */
export async function readNdjson(res: Response, onEvent: (event: StreamEvent) => void): Promise<void> {
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as StreamEvent);
    }
  }
}
