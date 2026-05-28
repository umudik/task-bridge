import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, FolderKanban, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/useSession";
import { fetchProjects, type Project } from "@/lib/api";
import { clearSession, setSelectedProject } from "@/lib/session";
import { cn } from "@/lib/utils";

export function ProjectsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    navigate(`/projects/${project.id}/board`);
  }

  function signOut() {
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <div className="surface-grid flex min-h-full flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex items-center justify-between">
          <BrandMark />
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>

        <Card className="border-primary/15 bg-card/95 shadow-xl backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <FolderKanban className="h-5 w-5 text-primary" />
              Choose a project
            </CardTitle>
            <CardDescription>Pick where tasks should land. No project, no board.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </>
            ) : error ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" onClick={() => void reload()}>
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects yet. Check projects.json seed data and restart the backend.
              </p>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => openProject(project)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/40",
                  )}
                >
                  <div className="min-w-0">
                    <p className="font-medium">{project.name}</p>
                    <p className="text-sm text-muted-foreground">{project.id}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
