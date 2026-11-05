import { promises as fs } from "fs";
import path from "path";
import { tServer } from "@/lib/i18n-server";

const VIDEOS_DIR = path.join(process.cwd(), "public", "videos");
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v"]);

// Timeline video uploads. The file is the raw request body rather than a data
// URL like audio layers: a phone video is easily hundreds of MB.
export async function POST(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  const ext = path.extname(name).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) {
    return Response.json({ error: tServer("Desteklenmeyen video türü") }, { status: 400 });
  }

  const filename = `upload-${crypto.randomUUID()}${ext}`;
  await fs.mkdir(VIDEOS_DIR, { recursive: true });
  await fs.writeFile(path.join(VIDEOS_DIR, filename), Buffer.from(await request.arrayBuffer()));
  return Response.json({ url: `/videos/${filename}` });
}
