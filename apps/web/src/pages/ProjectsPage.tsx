import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GitBranch, LogOut, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/BrandMark";
import { CreateProjectPanel } from "@/components/CreateProjectPanel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/useSession";
import { fetchProjects, type Project } from "@/lib/api";
import { clearSession, setSelectedProject } from "@/lib/session";
export function ProjectsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      setProjects(await fetchProjects(session));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load projects";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void reload();
  }, [reload, location.key]);

  function openProject(project: Project) {
    if (!session) return;
    setSelectedProject(project.id, project.name);
    navigate(`/projects/${project.id}/tasks`);
  }

  function signOut() {
    clearSession();
    navigate("/login", { replace: true });
  }

  function handleCreated(project: Project) {
    void reload();
    toast.success(`Project "${project.name}" created`);
    openProject(project);
  }

  if (!session) return null;

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="flex h-14 shrink-0 items-center border-b border-white/[0.06] px-4">
          <BrandMark compact />
        </div>

        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Projects</p>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {loading ? (
            <>
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </>
          ) : error ? (
            <div className="space-y-2 p-2">
              <p className="text-xs text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="w-full" onClick={() => void reload()}>
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : projects.length === 0 ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              Create project
            </button>
          ) : (
            projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => openProject(project)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.04]"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
              </button>
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-white/[0.06] p-2">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Global
          </p>
          <div className="space-y-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-start rounded-lg text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
            onClick={() => navigate("/workflow-templates")}
          >
            <GitBranch className="h-4 w-4" />
            Workflow templates
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-start rounded-lg text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
          </div>
        </div>
      </aside>

      <main className="app-main flex items-center justify-center p-8">
        {createOpen ? (
          <CreateProjectPanel
            session={session}
            onCreated={handleCreated}
            onCancel={() => setCreateOpen(false)}
          />
        ) : (
          <div className="w-full max-w-md text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Select a project</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick a workspace from the sidebar or create a new one.
            </p>
            {!loading && projects.length === 0 ? (
              <Button className="mt-6" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New project
              </Button>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
