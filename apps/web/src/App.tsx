import { Navigate, Route, Routes } from "react-router-dom";
import { ProjectLayout } from "@/components/layout/ProjectLayout";
import { InboxPage } from "@/pages/InboxPage";
import { LoginPage } from "@/pages/LoginPage";
import { MobilePage } from "@/pages/MobilePage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import { TasksPage } from "@/pages/TasksPage";
import { TaskPage } from "@/pages/TaskPage";
import { WorkflowPage } from "@/pages/WorkflowPage";
import { WorkflowTemplatesPage } from "@/pages/WorkflowTemplatesPage";
import { loadSession } from "@/lib/session";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = loadSession();
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <div className="h-full">
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/projects"
        element={
          <RequireAuth>
            <ProjectsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/workflow-templates"
        element={
          <RequireAuth>
            <WorkflowTemplatesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/projects/:projectId"
        element={
          <RequireAuth>
            <ProjectLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="tasks" replace />} />
        <Route path="board" element={<Navigate to="tasks" replace />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/:taskId" element={<TaskPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="mobile" element={<MobilePage />} />
        <Route path="workflow" element={<WorkflowPage />} />
      </Route>
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
    </div>
  );
}

function RootRedirect() {
  const session = loadSession();
  if (!session) return <Navigate to="/login" replace />;
  if (session.projectId) {
    return <Navigate to={`/projects/${session.projectId}/tasks`} replace />;
  }
  return <Navigate to="/projects" replace />;
}
