import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";

// The image gallery: files in public/generated, index in data/generations.json.
// Shared by the create page (POST /api/save) and agent generation
// (POST /api/images), so both land in the same gallery.

const GENERATED_DIR = path.join(process.cwd(), "public", "generated");
const MANIFEST_PATH = path.join(process.cwd(), "data", "generations.json");

export type Generation = {
  id: string;
  prompt: string;
  modelId: string;
  modelLabel: string;
  ratio: string;
  url: string;
  createdAt: string;
  tag?: string;
};

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "image"
  );
}

export async function readGenerations(): Promise<Generation[]> {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8")) as Generation[];
  } catch {
    return [];
  }
}

export function decodeImage(dataUrl: string): { buffer: Buffer; ext: string } | null {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { ext: match[1] === "jpeg" ? "jpg" : match[1], buffer: Buffer.from(match[2], "base64") };
}

export async function saveGeneration(params: {
  prompt: string;
  buffer: Buffer;
  ext: string;
  modelId?: string;
  modelLabel?: string;
  ratio?: string;
  tag?: string;
}): Promise<Generation> {
  await fs.mkdir(GENERATED_DIR, { recursive: true });
  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });

  const filename = `${Date.now()}-${slugify(params.prompt)}.${params.ext}`;
  await fs.writeFile(path.join(GENERATED_DIR, filename), params.buffer);

  const record: Generation = {
    id: crypto.randomUUID(),
    prompt: params.prompt,
    modelId: params.modelId ?? "unknown",
    modelLabel: params.modelLabel ?? "Bilinmeyen model",
    ratio: params.ratio ?? "1:1",
    url: `/generated/${filename}`,
    createdAt: new Date().toISOString(),
    tag: typeof params.tag === "string" && params.tag.trim() ? params.tag.trim().slice(0, 40) : undefined,
  };

  const manifest = await readGenerations();
  manifest.unshift(record);
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  return record;
}
