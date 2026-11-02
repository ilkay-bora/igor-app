import fs from "fs";
import path from "path";
import { comfyDir, detectComfyLayout } from "@/lib/comfy-launcher";
import { FOLDER_ALIASES, MODEL_GROUPS } from "@/lib/comfy-models";
import { comfyUrl } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Which of IGOR's required model files are installed. Asks a running
// ComfyUI first (its /models/<folder> list also covers extra_model_paths),
// otherwise looks inside the configured install's models/ folder.
export async function GET() {
  const folders = [...new Set(MODEL_GROUPS.flatMap((g) => g.models.map((m) => m.folder)))];
  let listed: Record<string, Set<string>> | null = null;

  try {
    const entries = await Promise.all(
      folders.map(async (folder) => {
        const names = new Set<string>();
        for (const alias of FOLDER_ALIASES[folder] ?? [folder]) {
          const res = await fetch(`${comfyUrl()}/models/${alias}`, { signal: AbortSignal.timeout(3000) });
          if (!res.ok) continue;
          for (const n of (await res.json()) as string[]) names.add(path.basename(n.replace(/\\/g, "/")));
        }
        return [folder, names] as const;
      })
    );
    listed = Object.fromEntries(entries);
  } catch {
    listed = null; // ComfyUI not running
  }

  const layout = detectComfyLayout(comfyDir());
  const onDisk = (folder: string, file: string) =>
    !!layout &&
    (FOLDER_ALIASES[folder] ?? [folder]).some((alias) => fs.existsSync(path.join(layout.appDir, "models", alias, file)));

  const groups = MODEL_GROUPS.map((g) => ({
    id: g.id,
    models: g.models.map((m) => ({
      ...m,
      ok: listed ? listed[m.folder]?.has(m.file) || onDisk(m.folder, m.file) : onDisk(m.folder, m.file),
    })),
  }));

  return Response.json({
    via: listed ? "comfy" : layout ? "disk" : "none",
    modelsDir: layout ? path.join(layout.appDir, "models") : null,
    groups,
  });
}
