import { listProjectMemberRows } from "../db/workflow-db.js";
import { emptyToNull } from "../lib/strings.js";
import { parseActorKind, parseStageRolesJson, type AssigneeKind } from "./workflow-stage.js";

export type ProjectMemberProfile = {
  name: string;
  role: string;
  actorKind: AssigneeKind;
};

function readMemberRole(row: { role: string; stage_roles_json: string }): string {
  const direct = emptyToNull(row.role);
  if (direct) return direct;
  const legacy = Object.values(parseStageRolesJson(row.stage_roles_json))
    .map(emptyToNull)
    .find((value): value is string => Boolean(value));
  if (legacy) return legacy;
  return "";
}

export function findProjectMember(
  projectId: string,
  memberName: string,
): ProjectMemberProfile | null {
  const name = emptyToNull(memberName);
  if (!name) return null;
  const row = listProjectMemberRows(projectId).find((entry) => entry.name === name);
  if (!row) return null;
  return {
    name: row.name,
    role: readMemberRole(row),
    actorKind: parseActorKind(row.actor_kind),
  };
}
