import { promises as fs } from "fs";
import path from "path";

// What the studio is busy with right now. The desktop shell asks this before
// quitting (closing the window quits IGOR when nothing is running) and the
// ComfyUI idle watcher uses it to decide when ComfyUI can be shut down.
//
// The queues persist their state to data/*.json on every change, so those
// files are the source of truth here. A queue does not resume after a
// restart, so a "queued"/"running" entry created before this server process
// started is stale and does not count as busy.

const DATA = path.join(process.cwd(), "data");
const BOOTED_AT = Date.now() - process.uptime() * 1000;

type Entry = { status?: string; createdAt?: string };

// Shared through globalThis: route handlers can live in separate bundles,
// each with its own copy of this module.
const state = globalThis as unknown as { __igorInflight?: number; __igorLastActive?: number };

/** Counts a foreground generation (e.g. a ComfyUI image) while it runs. */
export async function trackActivity<T>(work: () => Promise<T>): Promise<T> {
  state.__igorInflight = (state.__igorInflight ?? 0) + 1;
  markActive();
  try {
    return await work();
  } finally {
    state.__igorInflight = Math.max(0, (state.__igorInflight ?? 1) - 1);
    markActive();
  }
}

export function markActive() {
  state.__igorLastActive = Date.now();
}

export function lastActive(): number {
  return state.__igorLastActive ?? BOOTED_AT;
}

async function countLive(file: string, statuses: string[]): Promise<number> {
  try {
    const list = JSON.parse(await fs.readFile(path.join(DATA, file), "utf8")) as Entry[];
    return list.filter(
      (e) => e.status && statuses.includes(e.status) && (!e.createdAt || Date.parse(e.createdAt) >= BOOTED_AT)
    ).length;
  } catch {
    return 0;
  }
}

export type Activity = {
  busy: boolean;
  videoJobs: number;
  renders: number;
  merges: number;
  generations: number;
};

export async function getActivity(): Promise<Activity> {
  const [videoJobs, renders, merges] = await Promise.all([
    countLive("videos.json", ["queued", "running"]),
    countLive("editor-projects.json", ["queued", "running"]),
    countLive("video-projects.json", ["running"]),
  ]);
  const generations = state.__igorInflight ?? 0;
  const busy = videoJobs + renders + merges + generations > 0;
  if (busy) markActive();
  return { busy, videoJobs, renders, merges, generations };
}
