import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Maximize2,
  Plus,
  ZoomIn,
  ZoomOut,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StageTaskTemplate, WorkflowStage } from "@/lib/api";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  STAGE_CARD_HEIGHT,
  STAGE_CARD_WIDTH,
  STEP_TASK_GAP,
  TASK_TEMPLATE_HEIGHT,
  type DisplayStage,
  stageStackHeight,
  stagesForDisplay,
} from "./workflow-utils";

type WorkflowCanvasProps = {
  stages: WorkflowStage[];
  selectedStageId?: string | null;
  selectedTaskTemplateId?: string | null;
  onAddStage: () => void;
  onInsertStageAfter: (afterIndex: number) => void;
  onMoveStage: (index: number, delta: -1 | 1) => void;
  onSelectStage?: (flowIndex: number) => void;
  onSelectTaskTemplate?: (flowIndex: number, templateId: string) => void;
  className?: string;
};

type Point = { x: number; y: number };

type PanDrag = {
  startX: number;
  startY: number;
  panX: number;
  panY: number;
};

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.6;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function connectorPath(from: DisplayStage, to: DisplayStage) {
  const start = { x: from.displayX + STAGE_CARD_WIDTH, y: from.displayY + STAGE_CARD_HEIGHT / 2 };
  const end = { x: to.displayX, y: to.displayY + STAGE_CARD_HEIGHT / 2 };
  const dx = Math.max(80, Math.abs(end.x - start.x) * 0.45);
  return `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;
}

function connectorMidpoint(from: DisplayStage, to: DisplayStage) {
  const start = { x: from.displayX + STAGE_CARD_WIDTH, y: from.displayY + STAGE_CARD_HEIGHT / 2 };
  const end = { x: to.displayX, y: to.displayY + STAGE_CARD_HEIGHT / 2 };
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

function StageCard({
  stage,
  flowIndex,
  selected,
  canMoveLeft,
  canMoveRight,
  onSelect,
  onMoveLeft,
  onMoveRight,
}: {
  stage: DisplayStage;
  flowIndex: number;
  selected: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onSelect: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}) {
  const templateCount = stage.taskTemplates?.length ?? 0;
  return (
    <div
      data-stage-card="true"
      className={cn(
        "pointer-events-auto relative flex w-full shrink-0 select-none flex-col overflow-hidden rounded-2xl border bg-[#161616] shadow-lg transition-[border-color,box-shadow] duration-150",
        selected ? "border-white/25 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]" : "border-white/[0.08]",
      )}
      style={{ height: STAGE_CARD_HEIGHT }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <button
          type="button"
          disabled={!canMoveLeft}
          onClick={(event) => {
            event.stopPropagation();
            onMoveLeft();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
          aria-label="Move left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-0 flex-1 truncate px-1 text-center text-[11px] font-medium text-muted-foreground">
          {flowIndex + 1}
        </span>
        <button
          type="button"
          disabled={!canMoveRight}
          onClick={(event) => {
            event.stopPropagation();
            onMoveRight();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
          aria-label="Move right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <button
        type="button"
        data-stage-select="true"
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        className="flex min-h-0 flex-1 items-center justify-between gap-2 px-4 py-2 text-left transition-colors hover:bg-white/[0.03]"
      >
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-snug text-white">
          {stage.title || "Untitled"}
        </p>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {stage.autoAssignRole ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-[10px] font-medium text-primary">
              <Zap className="h-2.5 w-2.5" />
              {stage.autoAssignRole}
            </span>
          ) : null}
          {templateCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] font-medium text-emerald-400">
              <Layers className="h-2.5 w-2.5" />
              {templateCount} tasks
            </span>
          ) : null}
        </div>
      </button>
    </div>
  );
}

function TaskTemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: StageTaskTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-task-template="true"
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className={cn(
        "pointer-events-auto relative flex w-full shrink-0 items-center rounded-lg border px-3 text-left transition-[border-color,background-color] duration-150 hover:bg-[#151515]",
        selected ? "border-emerald-500/30 bg-[#141a16]" : "border-white/[0.07] bg-[#111111]",
      )}
      style={{ minHeight: TASK_TEMPLATE_HEIGHT }}
    >
      <div className="flex w-full items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/80" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-white/90">{template.title}</span>
        {template.assigneeRole ? (
          <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {template.assigneeRole}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function StageColumn({
  stage,
  flowIndex,
  templates,
  selectedStageId,
  selectedTaskTemplateId,
  canMoveLeft,
  canMoveRight,
  onSelectStage,
  onSelectTaskTemplate,
  onMoveLeft,
  onMoveRight,
}: {
  stage: DisplayStage;
  flowIndex: number;
  templates: StageTaskTemplate[];
  selectedStageId: string | null;
  selectedTaskTemplateId: string | null;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onSelectStage: () => void;
  onSelectTaskTemplate: (templateId: string) => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}) {
  return (
    <div
      className="pointer-events-none absolute flex flex-col items-stretch"
      style={{ left: stage.displayX, top: stage.displayY, width: STAGE_CARD_WIDTH }}
    >
      <div className="relative z-10 shrink-0">
        <StageCard
          stage={stage}
          flowIndex={flowIndex}
          selected={selectedStageId === stage.id && !selectedTaskTemplateId}
          canMoveLeft={canMoveLeft}
          canMoveRight={canMoveRight}
          onSelect={onSelectStage}
          onMoveLeft={onMoveLeft}
          onMoveRight={onMoveRight}
        />
      </div>
      {templates.length > 0 ? (
        <div
          className="pointer-events-auto relative z-0 flex flex-col gap-2 border-l border-white/[0.08] pl-3"
          style={{ marginTop: STEP_TASK_GAP }}
        >
          {templates.map((template) => (
            <TaskTemplateCard
              key={template.id}
              template={template}
              selected={selectedStageId === stage.id && selectedTaskTemplateId === template.id}
              onSelect={() => onSelectTaskTemplate(template.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowCanvas({
  stages,
  selectedStageId = null,
  selectedTaskTemplateId = null,
  onAddStage,
  onInsertStageAfter,
  onMoveStage,
  onSelectStage,
  onSelectTaskTemplate,
  className,
}: WorkflowCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<Point>({ x: 48, y: 48 });
  const zoomRef = useRef(0.85);
  const [pan, setPan] = useState<Point>({ x: 48, y: 48 });
  const [zoom, setZoom] = useState(0.85);
  const [panDrag, setPanDrag] = useState<PanDrag | null>(null);

  panRef.current = pan;
  zoomRef.current = zoom;

  const displayStages = useMemo(() => stagesForDisplay(stages), [stages]);

  const connectors = useMemo(() => {
    const paths: string[] = [];
    for (let index = 0; index < displayStages.length - 1; index += 1) {
      const from = displayStages[index];
      const to = displayStages[index + 1];
      if (from && to) paths.push(connectorPath(from, to));
    }
    return paths;
  }, [displayStages]);

  const fitView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || displayStages.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const stage of displayStages) {
      minX = Math.min(minX, stage.displayX);
      minY = Math.min(minY, stage.displayY);
      maxX = Math.max(maxX, stage.displayX + STAGE_CARD_WIDTH);
      maxY = Math.max(maxY, stage.displayY + stageStackHeight(stage));
    }

    const padding = 80;
    const boundsW = maxX - minX + padding * 2;
    const boundsH = maxY - minY + padding * 2;
    const nextZoom = clamp(
      Math.min(viewport.clientWidth / boundsW, viewport.clientHeight / boundsH),
      MIN_ZOOM,
      1,
    );
    const contentW = boundsW * nextZoom;
    const contentH = boundsH * nextZoom;
    setZoom(nextZoom);
    setPan({
      x: (viewport.clientWidth - contentW) / 2 - (minX - padding) * nextZoom,
      y: (viewport.clientHeight - contentH) / 2 - (minY - padding) * nextZoom,
    });
  }, [displayStages]);

  useEffect(() => {
    if (displayStages.length > 0) fitView();
  }, [displayStages.length, fitView]);

  useEffect(() => {
    if (!panDrag) return;
    const active = panDrag;

    function onMove(event: PointerEvent) {
      setPan({
        x: active.panX + (event.clientX - active.startX),
        y: active.panY + (event.clientY - active.startY),
      });
    }

    function onUp() {
      setPanDrag(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [panDrag]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    function onWheel(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const viewport = viewportRef.current;
        if (!viewport) return;
        const rect = viewport.getBoundingClientRect();
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;
        const currentZoom = zoomRef.current;
        const currentPan = panRef.current;
        const factor = event.deltaY < 0 ? 1.08 : 0.92;
        const nextZoom = clamp(currentZoom * factor, MIN_ZOOM, MAX_ZOOM);
        const scale = nextZoom / currentZoom;
        setPan({
          x: pointerX - (pointerX - currentPan.x) * scale,
          y: pointerY - (pointerY - currentPan.y) * scale,
        });
        setZoom(nextZoom);
        return;
      }
      setPan((current) => ({
        x: current.x - event.deltaX,
        y: current.y - event.deltaY,
      }));
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function isInteractiveTarget(target: HTMLElement) {
    return Boolean(target.closest("[data-stage-card], [data-stage-insert], [data-task-template]"));
  }

  function canStartPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button === 1) return true;
    if (event.button !== 0) return false;
    return !isInteractiveTarget(event.target as HTMLElement);
  }

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!canStartPan(event)) return;
    setPanDrag({
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    });
  }

  return (
    <div className={cn("relative flex min-h-0 flex-col bg-[#080808]", className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-2">
        <p className="text-xs text-muted-foreground">Click a step or task template · Drag to pan · Ctrl+scroll to zoom</p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => clamp(z * 0.9, MIN_ZOOM, MAX_ZOOM))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => clamp(z * 1.1, MIN_ZOOM, MAX_ZOOM))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => fitView()}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onAddStage}>
            <Plus className="h-4 w-4" />
            Add stage
          </Button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        onPointerDown={startPan}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
          }}
        >
          <svg className="pointer-events-none absolute inset-0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} aria-hidden>
            {connectors.map((path, index) => (
              <path
                key={`connector-${index}`}
                d={path}
                fill="none"
                stroke="rgba(96,165,250,0.35)"
                strokeWidth="2"
              />
            ))}
          </svg>

          {displayStages.map((stage, flowIndex) => {
            const templates = stage.taskTemplates ?? [];
            const nextStage = displayStages[flowIndex + 1];
            const midpoint = nextStage ? connectorMidpoint(stage, nextStage) : null;
            return (
              <div key={stage.id}>
                <StageColumn
                  stage={stage}
                  flowIndex={flowIndex}
                  templates={templates}
                  selectedStageId={selectedStageId}
                  selectedTaskTemplateId={selectedTaskTemplateId}
                  canMoveLeft={flowIndex > 0}
                  canMoveRight={flowIndex < displayStages.length - 1}
                  onSelectStage={() => onSelectStage?.(flowIndex)}
                  onSelectTaskTemplate={(templateId) => onSelectTaskTemplate?.(flowIndex, templateId)}
                  onMoveLeft={() => onMoveStage(flowIndex, -1)}
                  onMoveRight={() => onMoveStage(flowIndex, 1)}
                />
                {midpoint ? (
                  <button
                    type="button"
                    data-stage-insert="true"
                    title="Insert stage"
                    onClick={() => onInsertStageAfter(flowIndex)}
                    className="pointer-events-auto absolute z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.12] bg-[#1a1a1a] text-muted-foreground shadow-lg transition-colors hover:border-primary/40 hover:bg-primary/15 hover:text-primary"
                    style={{ left: midpoint.x - 14, top: midpoint.y - 14 }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
