import { useEffect, useRef } from "react";
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, GitBranch, Inbox, Layers, LogOut, Smartphone, type LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCommentNotifications } from "@/hooks/useCommentNotifications";
import { useSession } from "@/hooks/useSession";
import { fetchProjects } from "@/lib/api";
import { unreadCommentCount } from "@/lib/read-tasks";
import { clearSession, clearSelectedProject, setSelectedProject } from "@/lib/session";

export function ProjectLayout() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const syncedRef = useRef<string | null>(null);
  const { commentItems } = useCommentNotifications(session, projectId);
  const unread = unreadCommentCount(commentItems);
  const isWorkflow = location.pathname.endsWith("/workflow");

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
  const workflowPath = `/projects/${projectId}/workflow`;

  function signOut() {
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="flex h-14 shrink-0 items-center border-b border-white/[0.07] px-4">
          <BrandMark compact />
        </div>

        <div className="border-b border-white/[0.07] px-4 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Workspace</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{session.projectName ?? projectId}</p>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Work
            </p>
            <NavItem to={tasksPath} label="Epics" icon={Layers} />
            <NavItem to={inboxPath} label="Inbox" icon={Inbox} badge={unread} />
            <NavItem to={mobilePath} label="Mobile" icon={Smartphone} />
          </div>
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Configure
            </p>
            <NavItem to={workflowPath} label="Pipeline" icon={GitBranch} />
          </div>
        </nav>

        <div className="shrink-0 space-y-0.5 border-t border-white/[0.07] p-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-full justify-start rounded-lg text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
            onClick={() => {
              clearSelectedProject();
              navigate("/projects");
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            All projects
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
      </aside>

      <main className={cn("app-main", isWorkflow ? "overflow-hidden" : "overflow-y-auto")}>
        <Outlet />
      </main>
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
  icon: LucideIcon;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors",
          isActive
            ? "bg-white/[0.09] font-medium text-white"
            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0 opacity-90" />
      <span className="flex-1 truncate">{label}</span>
      <span
        className={cn(
          "flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-medium",
          badge > 0 ? "bg-primary text-primary-foreground" : "invisible",
        )}
        aria-hidden={badge <= 0}
      >
        {badge > 0 ? badge : 0}
      </span>
    </NavLink>
  );
}
