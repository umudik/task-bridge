import { useEffect, useRef } from "react";
import { NavLink, Navigate, Outlet, useNavigate, useParams } from "react-router-dom";
import { Inbox, ListTodo, LogOut, Smartphone } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useCommentNotifications } from "@/hooks/useCommentNotifications";
import { useSession } from "@/hooks/useSession";
import { fetchProjects } from "@/lib/api";
import { unreadCommentCount } from "@/lib/read-tasks";
import { clearSession, clearSelectedProject, setSelectedProject } from "@/lib/session";

export function ProjectLayout() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const syncedRef = useRef<string | null>(null);
  const { commentItems } = useCommentNotifications(session, projectId);
  const unread = unreadCommentCount(commentItems);

  useEffect(() => {
    if (!session || !projectId) return;
    if (syncedRef.current === projectId) return;
    let active = true;
    void fetchProjects(session).then((projects) => {
      if (!active) return;
      const project = projects.find((item) => item.id === projectId);
      if (!project) {
        navigate("/projects", { replace: true });
        return;
      }
      setSelectedProject(project.id, project.name);
      syncedRef.current = projectId;
    });
    return () => {
      active = false;
    };
  }, [session, projectId, navigate]);

  if (!session) return <Navigate to="/login" replace />;
  if (!projectId) return <Navigate to="/projects" replace />;

  const tasksPath = `/projects/${projectId}/tasks`;
  const inboxPath = `/projects/${projectId}/inbox`;
  const mobilePath = `/projects/${projectId}/mobile`;

  function signOut() {
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <div className="surface-grid min-h-full">
      <div className="mx-auto grid min-h-full w-full max-w-5xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[15rem_minmax(0,1fr)] md:py-8">
        <aside className="md:sticky md:top-8 md:self-start">
          <div className="w-full space-y-6 rounded-2xl border bg-card/80 p-5 backdrop-blur">
            <BrandMark />
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Project</p>
              <p className="truncate text-sm font-medium">{session.projectName ?? projectId}</p>
            </div>
            <nav className="space-y-1">
              <NavItem to={tasksPath} label="Tasks" icon={ListTodo} />
              <NavItem to={inboxPath} label="Inbox" icon={Inbox} badge={unread} />
              <NavItem to={mobilePath} label="Mobile" icon={Smartphone} />
            </nav>
            <Separator />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                clearSelectedProject();
                navigate("/projects");
              }}
            >
              Switch project
            </Button>
            <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </aside>
        <main className="min-w-0 pb-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  badge = 0,
}: {
  to: string;
  label: string;
  icon: typeof ListTodo;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
          isActive
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      <span
        className={cn(
          "flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-medium",
          badge > 0 ? "bg-primary text-primary-foreground" : "invisible",
        )}
        aria-hidden={badge <= 0}
      >
        {badge > 0 ? badge : 0}
      </span>
    </NavLink>
  );
}
