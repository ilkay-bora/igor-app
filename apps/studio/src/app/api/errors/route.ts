import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readErrors, logErrorServer } from "@/lib/error-log-server";

const ERRORS_PATH = path.join(process.cwd(), "data", "errors.json");

export async function GET() {
  return NextResponse.json(await readErrors());
}

export async function POST(request: Request) {
  const { prompt, modelId, modelLabel, ratio, message } = await request.json();
  if (!message) {
    return NextResponse.json({ error: "message gerekli" }, { status: 400 });
  }
  await logErrorServer({ prompt, modelId, modelLabel, ratio, message });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await fs.mkdir(path.dirname(ERRORS_PATH), { recursive: true });
  await fs.writeFile(ERRORS_PATH, "[]");
  return NextResponse.json({ ok: true });
}
