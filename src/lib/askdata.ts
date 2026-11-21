// Browser side of the TWise Ask Data integration. Calls go to this app's server
// (server/askdata.ts), which is signed in to TWise and forwards them.

export interface AskDataResult {
  columns: string[];
  rows: Record<string, unknown>[];
  /** Rows the query returned; `rows` may hold fewer. */
  totalRows: number;
}

/** Extra parts of an Ask Data answer, shown under the answer text. */
export interface AskDataDetails {
  /** Progress text while the answer is being prepared. */
  status?: string;
  sql?: string;
  result?: AskDataResult;
  insights?: string[];
  followups?: string[];
}

/** Whether the server is signed in to Ask Data, and why not if it isn't. */
export interface AskDataStatus {
  connected: boolean;
  error?: string;
}

export async function fetchAskDataStatus(): Promise<AskDataStatus> {
  try {
    const res = await fetch("/api/askdata/status");
    if (!res.ok) return { connected: false, error: `The app's server returned HTTP ${res.status}.` };
    return (await res.json()) as AskDataStatus;
  } catch {
    return { connected: false, error: "Couldn't reach the app's server." };
  }
}

/** Suggested questions for the start screen (empty if they can't be loaded). */
export async function fetchStarters(): Promise<string[]> {
  try {
    const res = await fetch("/api/askdata/starters");
    const list = (await res.json()) as unknown;
    return res.ok && Array.isArray(list) ? list.slice(0, 4) : [];
  } catch {
    return [];
  }
}
