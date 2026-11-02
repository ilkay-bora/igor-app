import { comfyStatus } from "@/lib/comfy-launcher";
import { getSetting, readSettings, settingSource, writeSettings, type SettingKey } from "@/lib/settings";

export const dynamic = "force-dynamic";

const SECRET_KEYS = ["geminiApiKey", "pollinationsApiKey"] as const;
const PLAIN_KEYS = ["comfyuiDir", "comfyuiUrl"] as const;

// Keys never go back to the browser in full: only whether one is set, where
// it comes from, and the last 4 characters so the user can recognise it.
async function view() {
  const secrets = Object.fromEntries(
    SECRET_KEYS.map((k) => {
      const v = getSetting(k);
      return [k, { set: !!v, source: settingSource(k), hint: v ? v.slice(-4) : "" }];
    })
  );
  const plain = Object.fromEntries(PLAIN_KEYS.map((k) => [k, { value: getSetting(k) ?? "", source: settingSource(k) }]));
  return { ...secrets, ...plain, setupDone: !!readSettings().setupDone, comfy: await comfyStatus() };
}

export async function GET() {
  return Response.json(await view());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Record<SettingKey, string>> & { setupDone?: boolean };
  const patch: Record<string, string | boolean | undefined> = {};
  for (const k of [...SECRET_KEYS, ...PLAIN_KEYS]) {
    if (typeof body[k] === "string") patch[k] = body[k];
  }
  if (typeof body.setupDone === "boolean") patch.setupDone = body.setupDone;
  writeSettings(patch);
  return Response.json(await view());
}
