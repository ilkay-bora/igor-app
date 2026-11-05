import { getActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

// Polled by the desktop shell: is anything still running that quitting would cut off?
export async function GET() {
  return Response.json(await getActivity());
}
