import { NavLink, matchPath, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  FolderKanban,
  GitBranch,
  Inbox,
  Layers,
  LogOut,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCommentNotifications } from "@/hooks/useCommentNotifications";
import { useSession } from "@/hooks/useSession";
import { unreadCommentCount } from "@/lib/read-tasks";
import { clearSession } from "@/lib/session";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  "read-write": "Read & Write",
  read: "Read only",
};

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();

  const projectMatch = matchPath("/projects/:projectId/*", location.pathname);
  const activeProjectId = projectMatch?.params.projectId;
  const fallbackProjectId = activeProjectId ?? session?.projectId;
  const projectId = activeProjectId;
  const projectName = session?.projectName ?? projectId ?? fallbackProjectId;

  const { commentItems } = useCommentNotifications(session, projectId);
  const unread = unreadCommentCount(commentItems);

  function signOut() {
    clearSession();
    navigate("/login", { replace: true });
  }

  const isAdmin = session?.userRole === "admin";

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
            <NavItem
              to={`/projects/${fallbackProjectId}/tasks`}
              label={projectName ?? "Open project"}
              icon={Layers}
            />
          </div>
        ) : undefined}

        {isAdmin ? (
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Admin
            </p>
            <NavItem to="/admin/users" label="Team members" icon={Users} />
          </div>
        ) : undefined}
      </nav>

      {/* Current user info + sign out */}
      <div className="shrink-0 border-t border-white/[0.07] p-2 space-y-1">
        {session ? (
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary uppercase">
              {session.userName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-foreground leading-none">
                {session.userName}
              </p>
              <p className="truncate text-[11px] text-muted-foreground mt-0.5">
                {ROLE_LABELS[session.userRole] ?? session.userRole}
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 hidden sm:flex">
              {ROLE_LABELS[session.userRole] ?? session.userRole}
            </Badge>
          </div>
        ) : undefined}

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
