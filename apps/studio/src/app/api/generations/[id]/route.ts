import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { tServer } from "@/lib/i18n-server";

const MANIFEST_PATH = path.join(process.cwd(), "data", "generations.json");

type Generation = {
  id: string;
  prompt: string;
  modelId: string;
  modelLabel: string;
  ratio: string;
  url: string;
  createdAt: string;
};

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/generations/[id]">
) {
  const { id } = await ctx.params;

  let manifest: Generation[];
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  } catch {
    return NextResponse.json({ error: tServer("Kayıt bulunamadı") }, { status: 404 });
  }

  const record = manifest.find((g) => g.id === id);
  if (!record) {
    return NextResponse.json({ error: tServer("Kayıt bulunamadı") }, { status: 404 });
  }

  const filePath = path.join(process.cwd(), "public", record.url.replace(/^\//, ""));
  await fs.unlink(filePath).catch(() => undefined);

  const updated = manifest.filter((g) => g.id !== id);
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(updated, null, 2));

  return NextResponse.json({ ok: true });
}
