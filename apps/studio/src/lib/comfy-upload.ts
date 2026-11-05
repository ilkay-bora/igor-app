import { comfyUrl } from "./settings";
import { tServer } from "@/lib/i18n-server";

export async function uploadImageToComfy(buffer: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(buffer)], { type: "image/png" }), filename);
  form.append("overwrite", "true");
  const res = await fetch(`${comfyUrl()}/upload/image`, { method: "POST", body: form });
  if (!res.ok) throw new Error(tServer("Görsel yüklenemedi ({status})", { status: res.status }));
  const data = await res.json();
  return data.name as string;
}

export function decodeImageDataUrl(dataUrl: string): { buffer: Buffer; ext: string } {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error(tServer("Geçersiz görsel verisi"));
  return { buffer: Buffer.from(match[2], "base64"), ext: match[1] };
}
