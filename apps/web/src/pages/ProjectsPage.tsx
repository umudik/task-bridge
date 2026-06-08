import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, FolderKanban, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { CreateProjectPanel } from "@/components/CreateProjectPanel";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/useSession";
import { fetchProjects, type Project } from "@/lib/api";
import { clearSelectedProject, setSelectedProject } from "@/lib/session";

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
    clearSelectedProject();
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, location.key]);

  function openProject(project: Project) {
    if (!session) return;
    setSelectedProject(project.id, project.name);
    navigate(`/projects/${project.id}/tasks`);
  }

  function handleCreated(project: Project) {
    setCreateOpen(false);
    void reload();
    toast.success(`Project "${project.name}" created`);
    openProject(project);
  }

  if (!session) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {createOpen ? (
        <div className="flex-1 overflow-y-auto p-8">
          <CreateProjectPanel
            session={session}
            onCreated={handleCreated}
            onCancel={() => setCreateOpen(false)}
          />
        </div>
      ) : (
        <>
          <PageHeader
            title="Projects"
            subtitle={
              loading
                ? "Loading workspaces…"
                : projects.length > 0
                  ? `${projects.length} workspace${projects.length === 1 ? "" : "s"}`
                  : "Create your first workspace to get started"
            }
            actions={
              <>
                <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh
                </Button>
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  New project
                </Button>
              </>
            }
          />

          <div className="flex-1 overflow-y-auto p-5">
              {loading && projects.length === 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <Skeleton className="h-28 rounded-2xl" />
                  <Skeleton className="h-28 rounded-2xl" />
                  <Skeleton className="h-28 rounded-2xl" />
                </div>
              ) : error ? (
                <div className="panel-card mx-auto max-w-md space-y-4 p-6 text-center">
                  <p className="text-sm text-destructive">{error}</p>
                  <Button variant="outline" size="sm" onClick={() => void reload()}>
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </Button>
                </div>
              ) : projects.length === 0 ? (
                <div className="panel-card flex flex-col items-center justify-center px-6 py-16 text-center">
                  <FolderKanban className="mb-4 h-10 w-10 text-muted-foreground/60" />
                  <p className="text-sm text-muted-foreground">No projects yet. Create one to start building epics.</p>
                  <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" />
                    New project
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => openProject(project)}
                      className="panel-card group flex min-h-[7rem] flex-col justify-between p-4 text-left transition-colors hover:border-white/[0.14] hover:bg-[#141414]"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                          <span className="text-[11px] text-muted-foreground">{project.id}</span>
                        </div>
                        <p className="line-clamp-2 text-sm font-semibold text-white group-hover:text-primary">
                          {project.name}
                        </p>
                        {project.repoPath ? (
                          <p className="line-clamp-1 text-xs text-muted-foreground">{project.repoPath}</p>
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-center justify-end text-xs text-muted-foreground">
                        <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
          </div>
        </>
      )}
    </div>
  );
}
