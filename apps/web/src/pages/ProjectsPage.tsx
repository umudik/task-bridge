import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, FolderKanban, Loader2, MoreVertical, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { CreateProjectPanel } from "@/components/CreateProjectPanel";
import { EditProjectModal } from "@/components/EditProjectModal";
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
  const [editingProject, setEditingProject] = useState<Project | null>(null);

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

  if (!session) return null;

  const activeSession = session;
  const canEdit = activeSession.userRole === "admin" || activeSession.userRole === "read-write";

  function openProject(project: Project) {
    setSelectedProject(project.id, project.name);
    navigate(`/projects/${project.id}/tasks`);
  }

  function handleCreated(project: Project) {
    setCreateOpen(false);
    void reload();
    toast.success(`Project "${project.name}" created`);
    openProject(project);
  }

  function handleProjectSaved(project: Project) {
    setProjects((current) =>
      current.map((item) => (item.id === project.id ? project : item)),
    );
    if (activeSession.projectId === project.id) {
      setSelectedProject(project.id, project.name);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {createOpen ? (
        <div className="flex-1 overflow-y-auto p-8">
          <CreateProjectPanel
            session={activeSession}
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
                  <article
                    key={project.id}
                    className="panel-card group relative transition-colors hover:border-white/[0.14] hover:bg-[#141414]"
                  >
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-2 z-10 h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingProject(project);
                        }}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openProject(project)}
                      className="flex min-h-[7rem] w-full flex-col justify-between p-4 pr-12 text-left"
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
                        {project.description.trim() ? (
                          <p className="line-clamp-2 text-xs text-muted-foreground/80">
                            {project.description.trim()}
                          </p>
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-center justify-end text-xs text-muted-foreground">
                        <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>

          <EditProjectModal
            session={activeSession}
            project={editingProject}
            open={editingProject !== null}
            onOpenChange={(open) => {
              if (!open) setEditingProject(null);
            }}
            onSaved={handleProjectSaved}
          />
        </>
      )}
    </div>
  );
}
