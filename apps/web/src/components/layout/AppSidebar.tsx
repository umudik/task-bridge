import { NavLink, matchPath, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  FolderKanban,
  GitBranch,
  Inbox,
  Layers,
  ShoppingBag,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { FookieCloudMark } from "@/components/FookieCloudMark";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCommentNotifications } from "@/hooks/useCommentNotifications";
import { useSession } from "@/hooks/useSession";
import { unreadCommentCount } from "@/lib/read-tasks";

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
  let activeProjectId: string | null = null;
  if (projectMatch !== null) {
    const paramId = projectMatch.params.projectId;
    if (typeof paramId === "string" && paramId.length > 0) {
      activeProjectId = paramId;
    }
  }
  let fallbackProjectId: string | null = activeProjectId;
  if (fallbackProjectId === null && session !== null && session.projectId !== null) {
    fallbackProjectId = session.projectId;
  }
  const projectId = activeProjectId;
  let projectName: string | null = projectId;
  if (session !== null && session.projectName !== null) {
    projectName = session.projectName;
  } else if (projectId === null && fallbackProjectId !== null) {
    projectName = fallbackProjectId;
  }

  const { commentItems } = useCommentNotifications(session, projectId);
  const unread = unreadCommentCount(commentItems);

  const isAdmin = session !== null && session.userRole === "admin";
  const onProfile = location.pathname === "/profile";

  let roleLabel = "";
  if (session !== null) {
    const roleKey = session.userRole;
    if (roleKey in ROLE_LABELS) {
      const label = ROLE_LABELS[roleKey];
      if (typeof label === "string") {
        roleLabel = label;
      }
    }
    if (roleLabel === "") {
      roleLabel = roleKey;
    }
  }

  return (
    <aside className="app-sidebar">
      <div className="flex h-14 shrink-0 items-center border-b border-white/[0.07] px-4">
        <BrandMark compact />
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        <div className="space-y-0.5">
          <NavItem to="/projects" label="Projects" icon={FolderKanban} end />
          <NavItem to="/marketplace" label="Marketplace" icon={ShoppingBag} />
          <NavItem to="/workflow-templates" label="Workflow templates" icon={GitBranch} />
        </div>

        {projectId ? (
          <div className="space-y-0.5">
            <p className="truncate px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {projectName}
            </p>
            <NavItem to={`/projects/${projectId}/tasks`} label="Epics" icon={Layers} />
            <NavItem to={`/projects/${projectId}/inbox`} label="Inbox" icon={Inbox} badge={unread} />
            <NavItem to={`/projects/${projectId}/library`} label="Library" icon={BookOpen} />
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
              label={projectName !== null ? projectName : "Open project"}
              icon={Layers}
            />
          </div>
        ) : null}

        {isAdmin ? (
          <div className="space-y-0.5">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Admin
            </p>
            <NavItem to="/admin/users" label="Team members" icon={Users} />
          </div>
        ) : null}
      </nav>

      {session ? (
        <div className="shrink-0 border-t border-white/[0.07] p-2 space-y-1">
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
              onProfile ? "bg-white/[0.09]" : "hover:bg-white/[0.05]",
            )}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold uppercase text-primary">
              {session.userName.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-none text-foreground">
                {session.userName}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{roleLabel}</p>
            </div>
            <Badge variant="outline" className="hidden shrink-0 px-1.5 py-0 text-[10px] sm:flex">
              {roleLabel}
            </Badge>
          </button>
          <div className="px-3 py-2">
            <FookieCloudMark size="sm" />
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t border-white/[0.07] px-4 py-3">
          <FookieCloudMark size="sm" />
        </div>
      )}
    </aside>
  );
}

type NavItemProps = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge: number | null;
  end: boolean | null;
};

function NavItem(rawProps: Partial<NavItemProps> & Pick<NavItemProps, "to" | "label" | "icon">) {
  let badge = 0;
  if ("badge" in rawProps && typeof rawProps.badge === "number") {
    badge = rawProps.badge;
  }
  let end = false;
  if ("end" in rawProps && rawProps.end === true) {
    end = true;
  }
  const { to, label, icon: Icon } = rawProps;

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
