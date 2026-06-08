import { NavLink, matchPath, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  FolderKanban,
  GitBranch,
  Inbox,
  Layers,
  LogOut,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCommentNotifications } from "@/hooks/useCommentNotifications";
import { useSession } from "@/hooks/useSession";
import { unreadCommentCount } from "@/lib/read-tasks";
import { clearSession } from "@/lib/session";

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();

  const projectMatch = matchPath("/projects/:projectId/*", location.pathname);
  const activeProjectId = projectMatch?.params.projectId;
  // On global pages, offer a shortcut back to the last project the user was in.
  const fallbackProjectId = activeProjectId ?? session?.projectId;
  const projectId = activeProjectId;
  const projectName = session?.projectName ?? projectId ?? fallbackProjectId;

  const { commentItems } = useCommentNotifications(session, projectId);
  const unread = unreadCommentCount(commentItems);

  function signOut() {
    clearSession();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="app-sidebar">
      <div className="flex h-14 shrink-0 items-center border-b border-white/[0.07] px-4">
        <BrandMark compact />
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        <div className="space-y-0.5">
          <NavItem to="/projects" label="Projects" icon={FolderKanban} end />
          <NavItem to="/library" label="Library" icon={BookOpen} />
          <NavItem to="/workflow-templates" label="Workflow templates" icon={GitBranch} />
        </div>

        {projectId ? (
          <div className="space-y-0.5">
            <p className="truncate px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {projectName}
            </p>
            <NavItem to={`/projects/${projectId}/tasks`} label="Epics" icon={Layers} />
            <NavItem to={`/projects/${projectId}/inbox`} label="Inbox" icon={Inbox} badge={unread} />
            <NavItem to={`/projects/${projectId}/mobile`} label="Mobile" icon={Smartphone} />
            <NavItem to={`/projects/${projectId}/workflow`} label="Pipeline" icon={GitBranch} />
          </div>
        ) : fallbackProjectId ? (
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Recent project
            </p>
            <NavItem to={`/projects/${fallbackProjectId}/tasks`} label={projectName ?? "Open project"} icon={Layers} />
          </div>
        ) : null}
      </nav>

      <div className="shrink-0 border-t border-white/[0.07] p-2">
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
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  badge = 0,
  end = false,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
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
