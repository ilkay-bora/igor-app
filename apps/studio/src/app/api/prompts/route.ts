import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const PROMPTS_PATH = path.join(process.cwd(), "data", "prompts.json");
const MAX_PROMPTS = 200;

type PromptEntry = { id: string; text: string; createdAt: string };

async function readPrompts(): Promise<PromptEntry[]> {
  try {
    const raw = await fs.readFile(PROMPTS_PATH, "utf8");
    return JSON.parse(raw) as PromptEntry[];
  } catch {
    return [];
  }
}

export async function GET() {
  return NextResponse.json(await readPrompts());
}

export async function POST(request: Request) {
  const { prompt } = await request.json();
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "prompt gerekli" }, { status: 400 });
  }

  const text = prompt.trim();
  const prompts = await readPrompts();

  if (prompts[0]?.text !== text) {
    prompts.unshift({ id: crypto.randomUUID(), text, createdAt: new Date().toISOString() });
    await fs.mkdir(path.dirname(PROMPTS_PATH), { recursive: true });
    await fs.writeFile(PROMPTS_PATH, JSON.stringify(prompts.slice(0, MAX_PROMPTS), null, 2));
  }

  return NextResponse.json({ ok: true });
}
