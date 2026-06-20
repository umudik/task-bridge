import { countSpawnableTemplates } from "../domain/task-template-graph.js";
import { DEFAULT_WORKFLOW_TEMPLATE_ID } from "../domain/workflow-template-id.js";
import type { StageTaskTemplate } from "../domain/workflow-stage.js";
import { serializeTaskTemplates } from "../domain/workflow-stage.js";
import { getProjectsDb } from "./projects-db.js";

export type WorkflowTemplateRow = {
  id: string;
  title: string;
  description: string;
  updated_at: string;
};

export type WorkflowTemplateStageRow = {
  template_id: string;
  id: string;
  title: string;
  description: string;
  purpose: string;
  rules_json: string;
  position: number;
  auto_assign: number;
  layout_x: number | null;
  layout_y: number | null;
  spawn_task_count: number;
  task_templates_json: string;
};

type TemplateStageSeed = {
  id: string;
  title: string;
  description: string;
  purpose: string;
  rules: string[];
  position: number;
  autoAssign: boolean;
  taskTemplates: StageTaskTemplate[] | null;
};

type TemplateSeed = {
  id: string;
  title: string;
  description: string;
  stages: TemplateStageSeed[];
};

const DEPRECATED_TEMPLATE_IDS = [
  "go",
  "nodejs",
  "sdlc-classic",
  "scrum-sprint",
  "devops-cicd",
  "agentic-engineering",
  "senior-team",
  "software-team",
  "spec-review-gate",
  "plan-decompose",
  "ready-for-pr",
  "review-security",
];

function task(
  id: string,
  title: string,
  description = "",
  assigneeRole = "",
  children: StageTaskTemplate[] = [],
  dependsOn: string[] = [],
): StageTaskTemplate {
  const trimmedRole = assigneeRole.trim();
  return {
    id,
    title,
    description,
    assigneeRole: trimmedRole || null,
    dependsOn,
    children,
  };
}

function chain(
  id: string,
  title: string,
  description: string,
  assigneeRole: string,
  steps: StageTaskTemplate[],
): StageTaskTemplate {
  let previousId: string | null = null;
  const children = steps.map((step) => {
    const node: StageTaskTemplate = {
      ...step,
      dependsOn: previousId ? [previousId] : [],
    };
    previousId = step.id;
    return node;
  });
  return task(id, title, description, assigneeRole, children);
}

const DEFAULT_TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    id: DEFAULT_WORKFLOW_TEMPLATE_ID,
    title: "Empty workflow",
    description: "Minimal pipeline with one step. Customize stages on the Pipeline tab.",
    stages: [
      {
        id: "backlog",
        title: "Backlog",
        description: "",
        purpose: "",
        rules: [],
        position: 0,
        autoAssign: false,
        taskTemplates: [],
      },
    ],
  },
  {
    id: "ai-sdlc",
    title: "AI Spec-Driven SDLC",
    description: `Single canonical pipeline for AI-assisted delivery.

**Sources:** GitHub Spec Kit, Thoughtworks SDD, Specorator, GSI-Protocol, pangon/ai-sdlc-scaffold.

**Golden rule:** Never skip human gates. Never open a public PR before **Human Pre-PR Approval**. Draft branch work is fine during implementation; gh pr ready only after human sign-off.`,
    stages: [
      {
        id: "constitution",
        title: "Constitution",
        description: `## Objective
Codify non-negotiable project rules agents must always obey (Spec Kit /speckit.constitution, Specorator memory/constitution.md).

## Entry
New epic or greenfield feature.

## Exit
AGENTS.md / CLAUDE.md committed with language, frameworks, testing, security, and dependency policies.

## Gate
Tech lead confirms constitution is enforceable — not aspirational markdown.`,
        purpose: "Project governance",
        rules: ["AGENTS.md exists", "Testing policy defined", "Security baseline stated"],
        position: 0,
        autoAssign: false,
        taskTemplates: [
          task(
            "cn-agents-md",
            "Write AGENTS.md / CLAUDE.md",
            "**Output:** root agent instructions.\n\n- Language & framework versions\n- Test commands that must exit 0\n- Lint/typecheck commands\n- Branch naming & commit style\n- Files agents must never edit\n- Human gate policy: no PR without approval",
            "tech-lead",
            [
              task(
                "cn-testing",
                "Define testing constitution",
                "**Output:** testing section in constitution.\n\n- Unit vs integration boundaries\n- TDD expectation\n- Coverage expectations for new logic\n- Flaky test policy (fix, don't skip)",
                "qa",
              ),
              task(
                "cn-security",
                "Define security baseline",
                "**Output:** security rules in constitution.\n\n- No secrets in repo\n- Auth patterns to follow\n- Dependency update policy\n- Input validation expectations",
                "architect",
              ),
              task(
                "cn-deps",
                "Dependency & tooling rules",
                "**Output:** allowed deps, package manager, CI commands.\n\n- Prefer stdlib before new packages\n- Pin versions policy\n- How to run build locally",
                "architect",
              ),
            ],
          ),
        ],
      },
      {
        id: "discovery",
        title: "Discovery",
        description: `## Objective
Validate the problem before writing specs (Specorator Stage 1–2: Idea + Research).

## Entry
Constitution in place.

## Exit
Problem statement, stakeholders, GOAL-* artifacts, explicit out-of-scope.

## Gate
Evidence that building this is worth the engineering cost.`,
        purpose: "Problem-solution fit",
        rules: ["Problem statement written", "Stakeholders listed", "Out of scope explicit"],
        position: 1,
        autoAssign: false,
        taskTemplates: [
          task(
            "dc-stakeholders",
            "Identify stakeholders",
            "**Output:** stakeholders.md\n\n- Decision makers (who approves gates)\n- End users\n- Maintainers / on-call\n- Security or compliance reviewers if applicable",
            "product",
          ),
          task(
            "dc-problem",
            "Write problem statement",
            "**Output:** problem statement in idea.md\n\n- Current pain (quantify if possible)\n- Desired outcome\n- Why now\n- What happens if we don't build this",
          ),
          task(
            "dc-goals",
            "Define goals",
            "**Output:** GOAL-* files\n\nMeasurable outcomes, not feature lists. Each goal links to a business or user outcome.",
            "product",
          ),
          task(
            "dc-constraints",
            "List constraints",
            "**Output:** CON-* files\n\nBudget, timeline, compliance, tech stack limits, team capacity.",
            "product",
          ),
          task(
            "dc-assumptions",
            "Capture assumptions",
            "**Output:** ASM-* files\n\nBeliefs not yet validated. Flag highest-risk assumptions for research.",
            "product",
          ),
          task(
            "dc-research",
            "Research alternatives",
            "**Output:** research.md (Specorator Stage 2)\n\n- ≥2 alternatives explored\n- Build vs buy vs integrate\n- Risks named with severity",
            "architect",
          ),
          task(
            "dc-scope-out",
            "Define out of scope",
            "**Output:** explicit non-goals in idea.md\n\nPrevents agent scope creep during implementation.",
            "product",
          ),
        ],
      },
      {
        id: "specification",
        title: "Specification",
        description: `## Objective
Write the authoritative spec — code is derived from this, not from chat context (Thoughtworks SDD, Jama spec-anchored).

## Entry
Discovery complete.

## Exit
User stories, REQ-* in EARS notation, acceptance criteria, BDD scenarios, traceability matrix.

## Gate
Every requirement is testable; no vague "should work well" language.`,
        purpose: "Intent capture",
        rules: ["EARS or Given/When/Then AC", "REQ IDs stable", "Traceability GOAL→US→REQ"],
        position: 2,
        autoAssign: true,
        taskTemplates: [
          task(
            "sp-stories",
            "Write user stories",
            "**Output:** US-* files\n\nFormat: As a [role], I want [action], so that [benefit]. Each story links to a GOAL-*.",
            "product",
          ),
          task(
            "sp-functional",
            "Functional requirements (EARS)",
            "**Output:** REQ-F-* files\n\nUse EARS patterns: Ubiquitous, Event-driven, State-driven, Unwanted behaviour. Stable IDs for traceability.",
            "product",
          ),
          task(
            "sp-nonfunctional",
            "Non-functional requirements",
            "**Output:** REQ-NF-* files\n\nPerformance, availability, security, observability, accessibility targets with measurable thresholds.",
            "architect",
          ),
          task(
            "sp-acceptance",
            "Acceptance criteria",
            "**Output:** AC per user story\n\nGiven/When/Then or checklist items a QA can execute without guessing.",
            "product",
          ),
          task(
            "sp-bdd",
            "BDD / Gherkin scenarios",
            "**Output:** .feature files or equivalent\n\nHappy path + error paths. Backend: API contract scenarios. Frontend: user-visible behaviour.",
            "qa",
          ),
          task(
            "sp-traceability",
            "Traceability matrix",
            "**Output:** RTM draft linking GOAL → US → REQ → future tests\n\nRequired for regulated or audit-sensitive work.",
            "product",
          ),
          task(
            "sp-edge-cases",
            "Edge cases & error catalogue",
            "**Output:** enumerated edge cases\n\nEmpty states, timeouts, permissions denied, rate limits, partial failures.",
            "qa",
          ),
          task(
            "sp-review-checklist",
            "Spec review checklist",
            "**Output:** completed Spec Kit Review & Acceptance Checklist\n\nMark pass/fail per item before human gate.",
            "tech-lead",
          ),
        ],
      },
      {
        id: "clarify",
        title: "Clarify",
        description: `## Objective
Surface ambiguities before design — mandatory Spec Kit step before planning (/speckit.clarify).

## Entry
Draft specification exists.

## Exit
Clarifications section added; open questions resolved or explicitly deferred with owner.

## Gate
No TBD items blocking design. Agent cannot proceed with guessed requirements.`,
        purpose: "Ambiguity removal",
        rules: ["Clarifications documented", "No blocking TBDs", "Deferred items have owner"],
        position: 3,
        autoAssign: true,
        taskTemplates: [
          task(
            "cl-scan",
            "Scan spec for ambiguity",
            "**Action:** structured pass over all spec artifacts.\n\nFlag vague adjectives, missing error behaviour, undefined actors, implicit dependencies.",
            "agent",
          ),
          task(
            "cl-questions",
            "Generate clarification questions",
            "**Output:** numbered questions for human\n\nPrioritize by risk: security > data > UX > nice-to-have.",
            "agent",
          ),
          task(
            "cl-answers",
            "Record human answers",
            "**Output:** Clarifications section in spec\n\nEach Q→A dated and attributed. Update affected REQ-* IDs.",
            "product",
          ),
          task(
            "cl-consistency",
            "Consistency pass",
            "**Action:** ensure clarifications don't contradict GOAL-* or CON-* constraints.",
            "tech-lead",
          ),
        ],
      },
      {
        id: "spec-approval",
        title: "Spec Approval",
        description: `## Objective
**Human gate 1** — formal approval before any architecture or code (SDDD mandatory validation checkpoint).

## Entry
Specification + Clarify complete.

## Exit
Spec status: Draft → **Approved**. Baseline tagged or versioned.

## Gate
Product + tech lead sign-off. **No design work until this gate passes.**`,
        purpose: "Human gate — spec",
        rules: ["Human sign-off recorded", "Spec frozen", "No code before approval"],
        position: 4,
        autoAssign: true,
        taskTemplates: [
          chain(
            "sa-product-review",
            "Product review",
            "**Action:** product owner reads all US-* and REQ-* artifacts.\n\nConfirm spec matches original intent. Reject if scope drift detected.",
            "product",
            [
              task(
                "sa-tech-review",
                "Technical feasibility review",
                "**Action:** tech lead confirms spec is implementable within constraints.\n\nFlag impossible NFRs or missing infra dependencies.",
                "tech-lead",
              ),
              task(
                "sa-ambiguity-final",
                "Final ambiguity sweep",
                "**Action:** remove remaining vague language agents could misinterpret.\n\nReplace 'fast', 'secure', 'user-friendly' with measurable criteria.",
                "tech-lead",
              ),
              task(
                "sa-approve",
                "Approve specification",
                "**Output:** Approved status on all spec artifacts + approval record (date, approver).\n\nThis unlocks Design stage.",
                "tech-lead",
              ),
              task(
                "sa-freeze",
                "Freeze spec baseline",
                "**Output:** git tag or spec version number\n\nImplementation must trace to this baseline. Changes require spec amendment + re-approval.",
                "tech-lead",
              ),
            ],
          ),
        ],
      },
      {
        id: "design",
        title: "Design",
        description: `## Objective
Technical blueprint from approved spec (Spec Kit /speckit.plan, GSI Architecture phase).

## Entry
Spec Approval gate passed.

## Exit
architecture.md, data-model.md, api-design.md, ADRs for irreversible decisions.

## Gate
Architect + tech lead review. Constitution compliance verified.`,
        purpose: "Technical blueprint",
        rules: ["Architecture doc complete", "ADRs for key decisions", "Constitution compliant"],
        position: 5,
        autoAssign: true,
        taskTemplates: [
          task(
            "ds-architecture",
            "System architecture",
            "**Output:** architecture.md\n\nComponents, boundaries, data flow, sync/async patterns, failure modes.",
            "architect",
          ),
          task(
            "ds-data-model",
            "Data model",
            "**Output:** data-model.md\n\nEntities, schemas, migrations, indexes, retention, PII handling.",
            "architect",
          ),
          task(
            "ds-api",
            "API design",
            "**Output:** api-design.md or OpenAPI draft\n\nEndpoints, auth, errors, idempotency, versioning.",
            "architect",
          ),
          task(
            "ds-security",
            "Security & threat model",
            "**Output:** security section or threat-model.md\n\nSTRIDE-lite: spoofing, tampering, elevation, data exposure.",
            "architect",
          ),
          task(
            "ds-adr",
            "Write ADRs",
            "**Output:** DEC-* files\n\nContext, options, decision, consequences. Required for irreversible choices.",
            "architect",
          ),
          task(
            "ds-components",
            "Component boundaries",
            "**Output:** component list for agent decomposition\n\nEach component: inputs, outputs, owner, test boundary.",
            "architect",
          ),
          task(
            "ds-nfr-map",
            "Map NFRs to design",
            "**Output:** table linking REQ-NF-* to architecture elements\n\nProves non-functionals are designed, not hoped for.",
            "architect",
          ),
        ],
      },
      {
        id: "plan-approval",
        title: "Plan Approval",
        description: `## Objective
**Human gate 2** — architects approve technical plan before task breakdown (Spec Kit: validate plan before tasks).

## Entry
Design artifacts complete.

## Exit
Plan status: Approved. Constitution + spec alignment confirmed.

## Gate
**Never jump spec → code.** Plan must be reviewed before decomposition.`,
        purpose: "Human gate — plan",
        rules: ["Architect sign-off", "Plan matches spec", "No tasks before approval"],
        position: 6,
        autoAssign: true,
        taskTemplates: [
          chain(
            "pa-architect-review",
            "Architect review",
            "**Action:** review architecture.md against approved REQ-* set.\n\nVerify no spec requirements are orphaned.",
            "architect",
            [
              task(
                "pa-constitution-check",
                "Constitution compliance",
                "**Action:** verify plan obeys AGENTS.md rules.\n\nFramework choices, testing approach, security patterns.",
                "tech-lead",
              ),
              task(
                "pa-risk-review",
                "Risk & trade-off review",
                "**Action:** review ADRs and flagged risks.\n\nAccept or mitigate before tasks are written.",
                "tech-lead",
              ),
              task(
                "pa-approve",
                "Approve technical plan",
                "**Output:** Approved status on design artifacts.\n\nUnlocks Tasks stage.",
                "tech-lead",
              ),
            ],
          ),
        ],
      },
      {
        id: "tasks",
        title: "Tasks",
        description: `## Objective
Decompose plan into atomic agent-executable packets (Spec Kit /speckit.tasks, Specorator Stage 6).

## Entry
Plan Approval gate passed.

## Exit
tasks.md with bounded packets, dependencies, acceptance criteria per task, test plan.

## Gate
Each task fits one agent context window; every task links to REQ-* IDs.`,
        purpose: "Work breakdown",
        rules: ["Tasks atomic", "Dependencies mapped", "Each task has AC"],
        position: 7,
        autoAssign: true,
        taskTemplates: [
          task(
            "tk-phases",
            "Define implementation phases",
            "**Output:** phased plan in tasks.md\n\nEach phase ends with something deployable/testable locally — not a monolith at the end.",
            "architect",
          ),
          task(
            "tk-backlog",
            "Generate task backlog",
            "**Output:** tasks.md with stable task IDs\n\nExample: 'Create POST /users validating email format (REQ-F-012)' not 'build auth'.",
            "architect",
          ),
          task(
            "tk-boundaries",
            "Bound task packets",
            "**Action:** split until each task is completable in one agent session.\n\nInclude file list hint per task where possible.",
            "architect",
          ),
          task(
            "tk-deps",
            "Map dependencies",
            "**Output:** dependsOn graph\n\nMark [P] parallel-safe vs sequential. Critical path identified.",
            "architect",
          ),
          task(
            "tk-ac",
            "Acceptance criteria per task",
            "**Output:** testable AC under each task\n\nAgent marks done only when AC objectively met.",
            "qa",
          ),
          task(
            "tk-test-plan",
            "Test plan per task",
            "**Output:** test-plan.md entries\n\nUnit, integration, contract tests expected per task.",
            "qa",
          ),
          task(
            "tk-order",
            "Prioritize execution order",
            "**Output:** ordered task list\n\nRisk spikes and foundation tasks first.",
            "tech-lead",
          ),
        ],
      },
      {
        id: "tasks-approval",
        title: "Tasks Approval",
        description: `## Objective
**Human gate 3** — approve task breakdown before any agent writes code (SDDD task validation checkpoint).

## Entry
tasks.md complete.

## Exit
Tasks approved. Implementation may begin.

## Gate
Human confirms scope per task is logical, complete, and not oversized.`,
        purpose: "Human gate — tasks",
        rules: ["Task breakdown approved", "No implementation before approval"],
        position: 8,
        autoAssign: true,
        taskTemplates: [
          chain(
            "ta-scope-review",
            "Scope review",
            "**Action:** human reads tasks.md end-to-end.\n\nEach task independently reviewable in a future PR diff.",
            "tech-lead",
            [
              task(
                "ta-coverage",
                "Requirement coverage check",
                "**Action:** every approved REQ-* maps to ≥1 task.\n\nNo orphan requirements.",
                "qa",
              ),
              task(
                "ta-sizing",
                "Task sizing check",
                "**Action:** reject tasks that are epics in disguise.\n\nSplit anything estimated >1 agent session.",
                "tech-lead",
              ),
              task(
                "ta-approve",
                "Approve task breakdown",
                "**Output:** Approved status on tasks.md.\n\nUnlocks Agent Context + Implementation.",
                "tech-lead",
              ),
            ],
          ),
        ],
      },
      {
        id: "agent-context",
        title: "Agent Context",
        description: `## Objective
Prepare repo knowledge layer so agents don't hallucinate structure (pangon ai-sdlc-scaffold, context-window efficiency).

## Entry
Tasks Approval gate passed.

## Exit
Indexes, status.md, spec/design indexes, .env.example updated.

## Gate
Agent can find GOAL/US/REQ/DEC/tasks without loading entire repo.`,
        purpose: "Context engineering",
        rules: ["Status doc current", "Indexes updated", ".env.example current"],
        position: 9,
        autoAssign: true,
        taskTemplates: [
          task(
            "cx-status",
            "Create or update status.md",
            "**Output:** status.md\n\nCurrent phase, active task, blockers, last handoff, next agent action.",
            "agent",
          ),
          task(
            "cx-spec-index",
            "Spec artifact index",
            "**Output:** phase index linking GOAL/US/REQ paths\n\nMinimize tokens per agent invocation.",
            "agent",
          ),
          task(
            "cx-decisions-index",
            "Decisions index",
            "**Output:** DEC-* index by component and phase.",
            "agent",
          ),
          task(
            "cx-repo-map",
            "Repo map",
            "**Output:** entry points, module boundaries, test locations.",
            "agent",
          ),
          task(
            "cx-branch",
            "Create feature branch",
            "**Output:** feature branch from dev/main\n\nWork stays local. **Do not open PR yet** — draft branch only.",
            "engineer",
          ),
          task(
            "cx-env-example",
            "Update .env.example",
            "**Output:** documented placeholders for any new config\n\nNever commit real secrets.",
            "engineer",
          ),
        ],
      },
      {
        id: "implementation",
        title: "Implementation",
        description: `## Objective
Execute approved tasks one at a time with TDD + logging (Spec Kit /speckit.implement, Specorator Stage 7).

## Entry
Agent context ready; feature branch exists.

## Exit
All tasks done; implementation-log.md entries; code + tests committed to branch.

## Gate
One task at a time. Design gaps stop work — update spec/ADR, don't guess.

**Note:** Draft PR optional during this stage; must stay draft until Human Pre-PR Approval.`,
        purpose: "Build",
        rules: ["One task at a time", "TDD", "Log each task", "No public PR yet"],
        position: 10,
        autoAssign: true,
        taskTemplates: [
          chain(
            "im-loop",
            "Task execution loop",
            "Repeat for each approved task until tasks.md is complete.",
            "",
            [
              task(
                "im-pick",
                "Pick next pending task",
                "**Action:** select next task from tasks.md by priority.\n\nRead linked REQ-* and design sections before any edit.",
                "agent",
              ),
              task(
                "im-context",
                "Load minimal context",
                "**Action:** open only files listed in task packet + constitution.\n\nDo not load entire repo into context.",
                "agent",
              ),
              task(
                "im-tdd",
                "Implement with TDD",
                "**Action:** write failing test → implement → refactor.\n\nMinimal diff; match existing conventions.",
                "agent",
              ),
              task(
                "im-gap",
                "Handle design gaps",
                "**Action:** if spec/design insufficient → STOP.\n\nUpdate spec or ADR; get human re-approval if scope changes.",
                "agent",
              ),
              task(
                "im-log",
                "Write implementation log",
                "**Output:** implementation-log/TASK-*.md\n\nFiles changed, decisions, debt, verification commands run.",
                "agent",
              ),
              task(
                "im-commit",
                "Commit task increment",
                "**Action:** atomic commit per task with task ID in message.\n\nPush to feature branch (still no public PR).",
                "agent",
              ),
            ],
          ),
          task(
            "im-docs",
            "Update documentation",
            "**Output:** README, API docs, inline docs where behaviour is non-obvious.",
            "engineer",
          ),
        ],
      },
      {
        id: "verification",
        title: "Verification",
        description: `## Objective
Programmatic quality gates — subprocess exit codes, not agent self-report (GSD-2 / Spec Loop Engine pattern).

## Entry
Implementation complete on feature branch.

## Exit
Lint, typecheck, unit, integration, contract tests all exit 0.

## Gate
Retry loop until green. Agent cannot claim success without command output.`,
        purpose: "Automated QA",
        rules: ["Lint exit 0", "Typecheck exit 0", "All tests exit 0"],
        position: 11,
        autoAssign: true,
        taskTemplates: [
          task(
            "vf-lint",
            "Run linter",
            "**Command:** project lint (eslint, detekt, etc.)\n\nFix all errors; warnings per team policy.",
            "qa",
          ),
          task(
            "vf-types",
            "Run type checker",
            "**Command:** tsc / mypy / kotlin compile\n\nZero type errors on changed modules.",
            "qa",
          ),
          task(
            "vf-unit",
            "Run unit tests",
            "**Command:** unit test suite\n\nNo skipped tests on critical paths without documented reason.",
            "qa",
          ),
          task(
            "vf-integration",
            "Run integration tests",
            "**Command:** integration suite\n\nDB, API, service boundaries exercised.",
            "qa",
          ),
          task(
            "vf-contract",
            "Contract / BDD verify",
            "**Command:** Gherkin runner or SpecBridge\n\nBehaviour matches approved scenarios.",
            "qa",
          ),
          task(
            "vf-retry",
            "Fix until green",
            "**Action:** on failure → fix → re-run.\n\nNo proceeding while red. Max retries logged in status.md.",
            "engineer",
          ),
          task(
            "vf-test-report",
            "Write test report",
            "**Output:** test-report.md (Specorator Stage 8)\n\nSuites run, pass/fail counts, known gaps.",
            "qa",
          ),
        ],
      },
      {
        id: "review-security",
        title: "Review & Security",
        description: `## Objective
Security audit + human review of agent output before pre-PR approval (Specorator QA track, agentic security review).

## Entry
Verification green.

## Exit
Security checklist complete; peer review notes; no secrets in diff; debt logged.

## Gate
This is review of **local branch work** — still no public PR.`,
        purpose: "Security & peer review",
        rules: ["Secrets scan clean", "Peer review done", "Debt logged"],
        position: 12,
        autoAssign: true,
        taskTemplates: [
          task(
            "rs-secrets",
            "Secrets scan",
            "**Action:** scan diff for keys, tokens, credentials, .env leaks.\n\nUse gitleaks or equivalent.",
            "qa",
          ),
          task(
            "rs-auth",
            "Auth & injection review",
            "**Action:** review authz, session handling, SQL/command injection, XSS surfaces.",
            "architect",
          ),
          task(
            "rs-deps",
            "Dependency audit",
            "**Action:** SCA scan; CVEs fixed, accepted with ADR, or mitigated.",
            "engineer",
          ),
          task(
            "rs-diff-review",
            "Human diff review",
            "**Action:** human reads full branch diff — not rubber-stamp.\n\nFocus on agent-generated code quality.",
            "tech-lead",
          ),
          task(
            "rs-anti-skip",
            "Anti-rationalization pass",
            "**Action:** reject excuses: 'tests flaky', 'types later', 'works on my machine'.\n\nAll gates must genuinely pass.",
            "tech-lead",
          ),
          task(
            "rs-debt",
            "Log technical debt",
            "**Output:** technical-debt.md entries\n\nShortcuts explicit with owner and follow-up task.",
            "engineer",
          ),
        ],
      },
      {
        id: "analyze",
        title: "Analyze",
        description: `## Objective
Cross-artifact consistency check (Spec Kit /speckit.analyze, Specorator /spec:analyze).

## Entry
Review & Security complete.

## Exit
traceability.md updated; spec ↔ plan ↔ tasks ↔ code alignment verified.

## Gate
No drift between approved spec and implementation. Gaps documented with resolution plan.`,
        purpose: "Consistency analysis",
        rules: ["RTM complete", "No spec drift", "Gaps documented"],
        position: 13,
        autoAssign: true,
        taskTemplates: [
          task(
            "an-spec-plan",
            "Spec ↔ plan alignment",
            "**Action:** verify design covers all approved REQ-*.\n\nFlag orphan requirements or orphan design elements.",
            "qa",
          ),
          task(
            "an-plan-code",
            "Plan ↔ code alignment",
            "**Action:** verify each task's AC is met in code.\n\nWalk tasks.md checklist item by item.",
            "qa",
          ),
          task(
            "an-rtm",
            "Update traceability matrix",
            "**Output:** traceability.md (Specorator Stage 9)\n\nGOAL → US → REQ → task → test → file mapping.",
            "qa",
          ),
          task(
            "an-drift",
            "Spec drift report",
            "**Output:** list any code behaviour not in spec.\n\nEither update spec (with re-approval) or revert code.",
            "tech-lead",
          ),
        ],
      },
      {
        id: "human-pre-pr-approval",
        title: "Human Pre-PR Approval",
        description: `## Objective
**Human gate 4 — mandatory before any PR is opened or marked ready.**

This is the fix for PR hierarchy: humans approve that branch work is complete and safe to **expose** as a pull request.

## Entry
Analyze stage complete; all automated gates green.

## Exit
Written approval record: "authorized to open PR".

## Gate
**No gh pr create, no gh pr ready, no public PR until this gate passes.** Agents must not self-open PRs.`,
        purpose: "Human gate — pre-PR",
        rules: ["Human written approval", "No PR before this gate", "All upstream gates passed"],
        position: 14,
        autoAssign: true,
        taskTemplates: [
          chain(
            "hp-demo",
            "Demo or walkthrough",
            "**Action:** author demos feature to approver (live or recording).\n\nApprover understands what will appear in the PR.",
            "engineer",
            [
              task(
                "hp-checklist",
                "Pre-PR checklist",
                "**Action:** confirm constitution, spec, plan, tasks, tests, security, analyze all passed.\n\nChecklist signed by approver.",
                "tech-lead",
              ),
              task(
                "hp-traceability",
                "Traceability sign-off",
                "**Action:** approver confirms RTM is accurate.\n\nRequired for audit-sensitive work.",
                "qa",
              ),
              task(
                "hp-approve",
                "Authorize PR creation",
                "**Output:** approval record in status.md or issue comment.\n\nExplicit: 'Approved to open PR to [target branch]'. **This unlocks Open PR stage.**",
                "tech-lead",
              ),
            ],
          ),
        ],
      },
      {
        id: "open-pr",
        title: "Open PR",
        description: `## Objective
Create and publish the pull request — **only after Human Pre-PR Approval** (Specorator: mark ready after testing + human review, not before).

## Entry
Human Pre-PR Approval gate passed with written authorization.

## Exit
PR opened (or draft → ready), description complete, CI triggered.

## Gate
PR description links spec, tasks, test plan, and REQ-* IDs.`,
        purpose: "Publish PR",
        rules: ["Pre-PR approval on record", "PR description complete", "CI triggered"],
        position: 15,
        autoAssign: true,
        taskTemplates: [
          task(
            "pr-desc",
            "Write PR description",
            "**Output:** PR body with:\n\n- Summary & motivation\n- Links to GOAL/US/REQ IDs\n- Test plan (commands + manual steps)\n- Screenshots if UI\n- Known limitations / debt",
            "engineer",
          ),
          task(
            "pr-create",
            "Open pull request",
            "**Action:** gh pr create to dev/main (or team target).\n\nOnly execute after hp-approve task is done.",
            "engineer",
          ),
          task(
            "pr-ready",
            "Mark PR ready for review",
            "**Action:** gh pr ready if was draft.\n\nMoves from WIP to reviewable state for team.",
            "engineer",
          ),
          task(
            "pr-ci",
            "CI pipeline green",
            "**Action:** wait for CI; fix failures on branch.\n\nRe-push until all checks pass.",
            "engineer",
          ),
        ],
      },
      {
        id: "pr-review",
        title: "PR Review",
        description: `## Objective
Team review cycle on the open PR — address feedback until merge-ready (Specorator Stage 9 Review).

## Entry
PR open and CI green.

## Exit
All review threads resolved; merge approval from required reviewers.

## Gate
Human merge approval. Agent does not self-merge.`,
        purpose: "PR review cycle",
        rules: ["Review threads resolved", "CI green", "Merge approval recorded"],
        position: 16,
        autoAssign: true,
        taskTemplates: [
          task(
            "rv-respond",
            "Address review comments",
            "**Action:** respond to each thread; push fixes or explain deferrals with linked debt item.",
            "engineer",
          ),
          task(
            "rv-rereview",
            "Request re-review",
            "**Action:** re-request reviewers after substantive changes.",
            "engineer",
          ),
          task(
            "rv-ci-recheck",
            "Re-run CI after changes",
            "**Action:** confirm CI green after each review fix round.",
            "engineer",
          ),
          task(
            "rv-merge-approve",
            "Merge approval",
            "**Output:** required approvers sign off.\n\nRecord in PR before merge.",
            "tech-lead",
          ),
          task(
            "rv-merge",
            "Merge to target branch",
            "**Action:** merge PR to dev/main per team convention.\n\nDelete feature branch if policy requires.",
            "engineer",
          ),
        ],
      },
      {
        id: "done",
        title: "Done",
        description: `## Objective
Epic closed after merge to dev. Production deployment is a separate release track.

## Entry
PR merged.

## Exit
Epic marked done; optional retrospective scheduled.

## Note
Deploy to staging/production is **not** part of this template — use your release pipeline separately.`,
        purpose: "Closed",
        rules: [],
        position: 17,
        autoAssign: false,
        taskTemplates: null,
      },
    ],
  },
];

function removeDeprecatedTemplates() {
  migrateWorkflowTemplateTables();
  const db = getProjectsDb();
  for (const id of DEPRECATED_TEMPLATE_IDS) {
    deleteWorkflowTemplateStages(id);
    db.prepare("DELETE FROM workflow_templates WHERE id = ?").run(id);
  }
}

function insertTemplateStages(template: TemplateSeed) {
  for (const stage of template.stages) {
    let taskTemplates: StageTaskTemplate[] = [];
    if (stage.taskTemplates !== null) {
      taskTemplates = stage.taskTemplates;
    }
    insertWorkflowTemplateStageRow({
      templateId: template.id,
      id: stage.id,
      title: stage.title,
      description: stage.description,
      purpose: stage.purpose,
      rulesJson: JSON.stringify(stage.rules),
      position: stage.position,
      autoAssign: stage.autoAssign,
      spawnTaskCount: countSpawnableTemplates(taskTemplates),
      taskTemplatesJson: serializeTaskTemplates(taskTemplates),
      layoutX: null,
      layoutY: null,
    });
  }
}

function upsertBuiltinTemplate(template: TemplateSeed) {
  if (template.id === "ai-sdlc") {
    const existing = listWorkflowTemplateRows({ id: template.id });
    if (existing.length > 0) {
      deleteWorkflowTemplateStages(template.id);
      getProjectsDb()
        .prepare("UPDATE workflow_templates SET title = ?, description = ?, updated_at = datetime('now') WHERE id = ?")
        .run(template.title, template.description, template.id);
    } else {
      insertWorkflowTemplateRow({
        id: template.id,
        title: template.title,
        description: template.description,
      });
    }
    insertTemplateStages(template);
    return;
  }
  const existing = listWorkflowTemplateRows({ id: template.id });
  if (existing.length > 0) return;
  insertWorkflowTemplateRow({
    id: template.id,
    title: template.title,
    description: template.description,
  });
  insertTemplateStages(template);
}

export function migrateWorkflowTemplateTables() {
  const db = getProjectsDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_templates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_template_stages (
      template_id TEXT NOT NULL,
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      purpose TEXT NOT NULL DEFAULT '',
      rules_json TEXT NOT NULL DEFAULT '[]',
      position INTEGER NOT NULL DEFAULT 0,
      auto_assign INTEGER NOT NULL DEFAULT 0,
      layout_x REAL,
      layout_y REAL,
      spawn_task_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (template_id, id)
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_template_stages_template
      ON workflow_template_stages(template_id);
  `);

  const columns = db.prepare("PRAGMA table_info(workflow_template_stages)").all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("task_templates_json")) {
    db.exec("ALTER TABLE workflow_template_stages ADD COLUMN task_templates_json TEXT NOT NULL DEFAULT '[]'");
  }
}

export function countWorkflowTemplates(): number {
  migrateWorkflowTemplateTables();
  const row = getProjectsDb()
    .prepare("SELECT COUNT(*) AS count FROM workflow_templates")
    .get() as { count: number };
  return row.count;
}

export function listWorkflowTemplateRows(filter: { id: string }): WorkflowTemplateRow[] {
  migrateWorkflowTemplateTables();
  const id = filter.id.trim();
  if (id !== "") {
    return getProjectsDb()
      .prepare(
        "SELECT id, title, description, updated_at FROM workflow_templates WHERE id = ?",
      )
      .all(id) as WorkflowTemplateRow[];
  }
  return getProjectsDb()
    .prepare(
      "SELECT id, title, description, updated_at FROM workflow_templates ORDER BY title COLLATE NOCASE ASC",
    )
    .all() as WorkflowTemplateRow[];
}

export function listWorkflowTemplateStageRows(templateId: string): WorkflowTemplateStageRow[] {
  migrateWorkflowTemplateTables();
  return getProjectsDb()
    .prepare(
      `SELECT template_id, id, title, description, purpose, rules_json, position, auto_assign, layout_x, layout_y, spawn_task_count, task_templates_json
       FROM workflow_template_stages WHERE template_id = ? ORDER BY position ASC, title COLLATE NOCASE ASC`,
    )
    .all(templateId.trim()) as WorkflowTemplateStageRow[];
}

export function deleteWorkflowTemplateStages(templateId: string) {
  migrateWorkflowTemplateTables();
  getProjectsDb()
    .prepare("DELETE FROM workflow_template_stages WHERE template_id = ?")
    .run(templateId.trim());
}

export function deleteWorkflowTemplateRow(templateId: string): boolean {
  migrateWorkflowTemplateTables();
  const id = templateId.trim();
  deleteWorkflowTemplateStages(id);
  const result = getProjectsDb().prepare("DELETE FROM workflow_templates WHERE id = ?").run(id);
  return result.changes > 0;
}

export function insertWorkflowTemplateRow(row: {
  id: string;
  title: string;
  description: string;
}) {
  migrateWorkflowTemplateTables();
  getProjectsDb()
    .prepare(
      `INSERT INTO workflow_templates (id, title, description, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
    )
    .run(row.id.trim(), row.title.trim(), row.description.trim());
}

export function insertWorkflowTemplateStageRow(row: {
  templateId: string;
  id: string;
  title: string;
  description: string;
  purpose: string;
  rulesJson: string;
  position: number;
  autoAssign: boolean;
  layoutX: number | null;
  layoutY: number | null;
  spawnTaskCount: number;
  taskTemplatesJson: string;
}) {
  migrateWorkflowTemplateTables();
  let autoAssignFlag = 0;
  if (row.autoAssign) {
    autoAssignFlag = 1;
  }
  getProjectsDb()
    .prepare(
      `INSERT INTO workflow_template_stages
        (template_id, id, title, description, purpose, rules_json, position, auto_assign, layout_x, layout_y, spawn_task_count, task_templates_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      row.templateId.trim(),
      row.id.trim(),
      row.title.trim(),
      row.description.trim(),
      row.purpose.trim(),
      row.rulesJson,
      row.position,
      autoAssignFlag,
      row.layoutX,
      row.layoutY,
      row.spawnTaskCount,
      row.taskTemplatesJson,
    );
}

export { DEFAULT_WORKFLOW_TEMPLATE_ID } from "../domain/workflow-template-id.js";

export function seedDefaultWorkflowTemplates() {
  migrateWorkflowTemplateTables();
  removeDeprecatedTemplates();
  for (const template of DEFAULT_TEMPLATE_SEEDS) {
    upsertBuiltinTemplate(template);
  }
}
