import { NextResponse } from "next/server";
import { decodeImage, saveGeneration } from "@/lib/generations";

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
    const decoded = decodeImage(dataUrl);
    if (!decoded) {
      return NextResponse.json({ error: "Geçersiz dataUrl" }, { status: 400 });
    }
    ({ buffer, ext } = decoded);
  } else {
    const res = await fetch(sourceUrl);
    if (!res.ok) {
      return NextResponse.json({ error: "Kaynak görsel alınamadı" }, { status: 502 });
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
    buffer = Buffer.from(await res.arrayBuffer());
  }

  return NextResponse.json(await saveGeneration({ prompt, modelId, modelLabel, ratio, buffer, ext, tag }));
}
