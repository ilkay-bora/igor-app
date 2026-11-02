import { promises as fs } from "fs";
import path from "path";

const ERRORS_PATH = path.join(process.cwd(), "data", "errors.json");
const MAX_ERRORS = 300;

export type ErrorEntry = {
  id: string;
  prompt: string;
  modelId: string;
  modelLabel: string;
  ratio: string;
  message: string;
  createdAt: string;
};

export async function readErrors(): Promise<ErrorEntry[]> {
  try {
    return JSON.parse(await fs.readFile(ERRORS_PATH, "utf8"));
  } catch {
    return [];
  }
}

export async function logErrorServer(entry: {
  prompt?: string;
  modelId?: string;
  modelLabel?: string;
  ratio?: string;
  message: string;
}) {
  const errors = await readErrors();
  errors.unshift({
    id: crypto.randomUUID(),
    prompt: entry.prompt ?? "",
    modelId: entry.modelId ?? "unknown",
    modelLabel: entry.modelLabel ?? "Bilinmeyen model",
    ratio: entry.ratio ?? "1:1",
    message: String(entry.message),
    createdAt: new Date().toISOString(),
  });

  await fs.mkdir(path.dirname(ERRORS_PATH), { recursive: true });
  await fs.writeFile(ERRORS_PATH, JSON.stringify(errors.slice(0, MAX_ERRORS), null, 2));
}
