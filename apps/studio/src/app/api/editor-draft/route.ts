import fs from "fs/promises";
import path from "path";

// The editor's work in progress, kept on disk so it survives restarts, a
// changed desktop port (new origin = empty browser storage) and, later, agent
// edits through the MCP server.
const DRAFT_FILE = path.join(process.cwd(), "data", "editor-draft.json");

export async function GET() {
  try {
    const raw = await fs.readFile(DRAFT_FILE, "utf8");
    return new Response(raw, { headers: { "Content-Type": "application/json" } });
  } catch {
    return Response.json(null);
  }
}

export async function PUT(request: Request) {
  const body = await request.text();
  try {
    JSON.parse(body);
  } catch {
    return Response.json({ error: "Geçersiz taslak" }, { status: 400 });
  }
  await fs.mkdir(path.dirname(DRAFT_FILE), { recursive: true });
  // Write-then-rename so a crash mid-write never leaves a half-written draft.
  const tmp = `${DRAFT_FILE}.tmp`;
  await fs.writeFile(tmp, body, "utf8");
  await fs.rename(tmp, DRAFT_FILE);
  return Response.json({ ok: true });
}

export async function DELETE() {
  await fs.rm(DRAFT_FILE, { force: true });
  return Response.json({ ok: true });
}
