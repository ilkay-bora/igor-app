import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const MANIFEST_PATH = path.join(process.cwd(), "data", "generations.json");

export async function GET() {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json([]);
  }
}
