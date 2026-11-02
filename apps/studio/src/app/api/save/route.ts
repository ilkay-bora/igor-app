import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const GENERATED_DIR = path.join(process.cwd(), "public", "generated");
const MANIFEST_PATH = path.join(process.cwd(), "data", "generations.json");

type Generation = {
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

async function readManifest(): Promise<Generation[]> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw) as Generation[];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const { prompt, modelId, modelLabel, ratio, dataUrl, sourceUrl, tag } = await request.json();

  if (!prompt || (!dataUrl && !sourceUrl)) {
    return NextResponse.json(
      { error: "prompt ve dataUrl ya da sourceUrl gerekli" },
      { status: 400 }
    );
  }

  let buffer: Buffer;
  let ext = "png";

  if (dataUrl) {
    const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      return NextResponse.json({ error: "Geçersiz dataUrl" }, { status: 400 });
    }
    ext = match[1];
    buffer = Buffer.from(match[2], "base64");
  } else {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      return NextResponse.json({ error: "Kaynak görsel alınamadı" }, { status: 502 });
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
    buffer = Buffer.from(await res.arrayBuffer());
  }

  await fs.mkdir(GENERATED_DIR, { recursive: true });
  await fs.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });

  const filename = `${Date.now()}-${slugify(prompt)}.${ext}`;
  await fs.writeFile(path.join(GENERATED_DIR, filename), buffer);

  const record: Generation = {
    id: crypto.randomUUID(),
    prompt,
    modelId: modelId ?? "unknown",
    modelLabel: modelLabel ?? "Bilinmeyen model",
    ratio: ratio ?? "1:1",
    url: `/generated/${filename}`,
    createdAt: new Date().toISOString(),
    tag: typeof tag === "string" && tag.trim() ? tag.trim().slice(0, 40) : undefined,
  };

  const manifest = await readManifest();
  manifest.unshift(record);
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  return NextResponse.json(record);
}
