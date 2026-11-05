import { enqueueEditorProject } from "@/lib/editor-projects";
import { draftToRenderParams } from "@/lib/editor-schema";
import { getProject } from "@/lib/projects";
import { projectErrorResponse } from "@/lib/project-api";
import { tServer } from "@/lib/i18n-server";

// Queues a saved project on the same render queue the editor uses. The render
// shows up in the editor's Render'lar tab; poll GET /api/editor-projects/<id>.
export async function POST(_request: Request, ctx: RouteContext<"/api/projects/[id]/render">) {
  const { id } = await ctx.params;
  try {
    const project = await getProject(id);
    if (project.draft.timeline.length === 0) {
      return Response.json({ error: tServer("Projede klip yok, önce add_clip") }, { status: 400 });
    }
    const render = await enqueueEditorProject({ ...draftToRenderParams(project.draft), musicVolume: 0.5 });
    return Response.json({ renderId: render.id, status: render.status });
  } catch (err) {
    return projectErrorResponse(err);
  }
}
