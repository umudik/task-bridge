import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";

export function AppLayout() {
  return (
    <div className="app-shell flex-col">
      <AppTopBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AppSidebar />
        <main className="app-main flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
