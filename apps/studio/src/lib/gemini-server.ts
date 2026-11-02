const MODEL = "gemini-2.5-flash-image";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

type InlineData = { mimeType?: string; mime_type?: string; data: string };
type GeminiPart = {
  text?: string;
  inlineData?: InlineData;
  inline_data?: InlineData;
};

export async function runGeminiGeneration(params: {
  prompt: string;
  ratio?: string;
  // Character-reference conditioning (masal/storybook mode): nano-banana
  // (gemini-2.5-flash-image) supports image-editing/consistency by taking an
  // inlineData image part alongside the text prompt — sending the image
  // first, as Gemini's own multi-turn image-editing examples do.
  referenceImageDataUrl?: string;
}): Promise<{ imageUrl: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY tanımlı değil. web/.env.local dosyasına ekle.");
  }

  const requestParts: GeminiPart[] = [];
  if (params.referenceImageDataUrl) {
    const match = /^data:([\w/+-]+);base64,(.+)$/.exec(params.referenceImageDataUrl);
    if (match) {
      requestParts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
  }
  requestParts.push({ text: params.prompt });

  const body = {
    contents: [{ parts: requestParts }],
    generationConfig: {
      responseModalities: ["Image"],
      ...(params.ratio ? { imageConfig: { aspectRatio: params.ratio } } : {}),
    },
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini API hatası (${res.status})`);
  }

  const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData || p.inline_data);
  if (!imagePart) {
    throw new Error("Gemini görsel döndürmedi");
  }

  const inline = imagePart.inlineData ?? imagePart.inline_data!;
  const mimeType = inline.mimeType ?? inline.mime_type;
  return { imageUrl: `data:${mimeType ?? "image/png"};base64,${inline.data}` };
}
