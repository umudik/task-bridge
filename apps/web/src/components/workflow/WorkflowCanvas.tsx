import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, Maximize2, Plus, Settings2, Users, ZoomIn, ZoomOut, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkflowStage } from "@/lib/api";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  STAGE_CARD_HEIGHT,
  STAGE_CARD_WIDTH,
  type DisplayStage,
  stagesForDisplay,
} from "./workflow-utils";

type WorkflowCanvasProps = {
  stages: WorkflowStage[];
  onSelectStage: (index: number) => void;
  onAddStage: () => void;
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

function StageCard({
  stage,
  flowIndex,
  selected,
  onSelect,
}: {
  stage: DisplayStage;
  flowIndex: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      data-stage-card="true"
      className={cn(
        "absolute select-none rounded-xl border bg-card/95 shadow-md backdrop-blur-sm transition-shadow",
        selected ? "border-primary ring-2 ring-primary/35" : "border-border hover:border-primary/35 hover:shadow-lg",
      )}
      style={{
        left: stage.displayX,
        top: stage.displayY,
        width: STAGE_CARD_WIDTH,
        minHeight: STAGE_CARD_HEIGHT,
      }}
    >
      <div className="flex items-start gap-2 p-3">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <p className="truncate text-sm font-semibold">{stage.title || "Untitled"}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {stage.purpose || stage.description || "Click to configure"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Step {flowIndex + 1}
            </span>
            {stage.rules.length > 0 ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {stage.rules.length} rules
              </span>
            ) : null}
            {stage.autoAssign ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <Zap className="h-2.5 w-2.5" />
                Auto
              </span>
            ) : null}
            {(stage.spawnTaskCount ?? 0) > 0 ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                <Layers className="h-2.5 w-2.5" />
                {stage.spawnTaskCount} tasks
              </span>
            ) : null}
            {stage.decisionIds.length > 0 ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <Users className="h-2.5 w-2.5" />
                {stage.decisionIds.length}
              </span>
            ) : null}
          </div>
        </button>

        <button
          type="button"
          onClick={onSelect}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Edit stage"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function WorkflowCanvas({ stages, onSelectStage, onAddStage }: WorkflowCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<Point>({ x: 48, y: 48 });
  const zoomRef = useRef(0.85);
  const [pan, setPan] = useState<Point>({ x: 48, y: 48 });
  const [zoom, setZoom] = useState(0.85);
  const [panDrag, setPanDrag] = useState<PanDrag | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  panRef.current = pan;
  zoomRef.current = zoom;

  const displayStages = useMemo(() => stagesForDisplay(stages), [stages]);

  const connectors = useMemo(() => {
    const paths: string[] = [];
    for (let index = 0; index < displayStages.length - 1; index += 1) {
      const from = displayStages[index];
      const to = displayStages[index + 1];
      if (!from || !to) continue;
      paths.push(connectorPath(from, to));
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
      maxY = Math.max(maxY, stage.displayY + STAGE_CARD_HEIGHT);
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

  function canStartPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button === 1) return true;
    if (event.button !== 0) return false;
    return !(event.target as HTMLElement).closest("[data-stage-card]");
  }

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!canStartPan(event)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPanDrag({
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    });
  }

  if (stages.length === 0) {
    return (
      <button
        type="button"
        onClick={onAddStage}
        className="flex min-h-[70vh] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/10 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
      >
        <Plus className="h-8 w-8" />
        <span className="text-sm font-medium">Add first stage</span>
      </button>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-[#0d1117]">
      <div className="absolute left-3 top-3 z-20 flex items-center gap-1 rounded-lg border border-border/80 bg-card/90 p-1 shadow-lg backdrop-blur">
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom((z) => clamp(z * 1.15, MIN_ZOOM, MAX_ZOOM))}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setZoom((z) => clamp(z * 0.87, MIN_ZOOM, MAX_ZOOM))}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={fitView}>
          <Maximize2 className="h-4 w-4" />
        </Button>
        <span className="px-2 text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button type="button" size="sm" variant="secondary" onClick={onAddStage}>
          <Plus className="h-4 w-4" />
          Stage
        </Button>
      </div>

      <div className="absolute bottom-3 right-3 z-20 rounded-lg border border-border/80 bg-card/90 px-3 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur">
        Hold & drag background to pan · Scroll to move · Ctrl+scroll to zoom
      </div>

      <div
        ref={viewportRef}
        className={cn("relative h-[72vh] w-full", panDrag ? "cursor-grabbing" : "cursor-grab")}
        onPointerDown={startPan}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            aria-hidden
          >
            <defs>
              <pattern id="workflow-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="rgba(148,163,184,0.22)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#workflow-grid)" />
            {connectors.map((path, index) => (
              <path
                key={`connector-${index}`}
                d={path}
                fill="none"
                stroke="rgba(96,165,250,0.5)"
                strokeWidth="2"
              />
            ))}
          </svg>

          {displayStages.map((stage, flowIndex) => (
            <StageCard
              key={stage.id}
              stage={stage}
              flowIndex={flowIndex}
              selected={selectedId === stage.id}
              onSelect={() => {
                setSelectedId(stage.id);
                onSelectStage(stages.findIndex((entry) => entry.id === stage.id));
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
