const COMFY_URL = process.env.COMFYUI_URL ?? "http://127.0.0.1:8188";

export async function uploadImageToComfy(buffer: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(buffer)], { type: "image/png" }), filename);
  form.append("overwrite", "true");
  const res = await fetch(`${COMFY_URL}/upload/image`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Görsel yüklenemedi (${res.status})`);
  const data = await res.json();
  return data.name as string;
}

export function decodeImageDataUrl(dataUrl: string): { buffer: Buffer; ext: string } {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Geçersiz görsel verisi");
  return { buffer: Buffer.from(match[2], "base64"), ext: match[1] };
}
