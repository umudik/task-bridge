import { listProjectMemberRows, listWorkflowStageRows } from "../db/workflow-db.js";
import { AppError } from "../errors/app-error.js";

function pickRandomMember(members: { name: string }[]): string {
  const index = Math.floor(Math.random() * members.length);
  return members[index]!.name;
}

export async function pickMemberByProjectRole(
  projectId: string,
  _roleName: string,
): Promise<string> {
  const members = listProjectMemberRows({ projectId, id: "" });
  if (members.length === 0) {
    throw new AppError("No project members to assign task", 400);
  }
  return pickRandomMember(members);
}

export async function resolveTaskAssignee(input: {
  projectId: string;
  assignee: string | null;
  assigneeRole: string | null;
  stageId: string | null;
}): Promise<{ assignee: string; assigneeRole: string | null }> {
  const explicit = input.assignee !== null ? input.assignee.trim() : "";
  if (explicit) {
    return { assignee: explicit, assigneeRole: input.assigneeRole };
  }

  let role = input.assigneeRole !== null ? input.assigneeRole.trim() : "";
  if (!role && input.stageId) {
    const stageRows = listWorkflowStageRows({
      projectId: input.projectId,
      stageId: input.stageId,
    });
    const stage = stageRows[0];
    if (stage) {
      role = stage.auto_assign_role.trim();
    }
  }

  const assignee = await pickMemberByProjectRole(input.projectId, role);
  return { assignee, assigneeRole: role || input.assigneeRole };
}
