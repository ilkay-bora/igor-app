// The editor's work in progress, stored server-side (data/editor-draft.json)
// via /api/editor-draft, so it survives reloads, restarts and desktop port
// changes. Uploaded audio/images live in the draft as data URLs.
export async function loadDraft<T>(): Promise<T | null> {
  try {
    const res = await fetch("/api/editor-draft", { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as T | null) ?? null;
  } catch {
    return null;
  }
}

export async function saveDraft<T>(draft: T): Promise<boolean> {
  try {
    const res = await fetch("/api/editor-draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await fetch("/api/editor-draft", { method: "DELETE" });
  } catch {
    // Nothing to clear if the server is unreachable.
  }
}
