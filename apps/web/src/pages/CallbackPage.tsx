import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { clearFookieTokens, exchangeCode } from "@/lib/auth";
import { fetchAuthMe } from "@/lib/api";
import { saveSession, type UserRole } from "@/lib/session";

export function CallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const code = params.get("code");
    const state = params.get("state");
    if (code === null || state === null) {
      setError("Missing OAuth code");
      return;
    }
    void exchangeCode(code, state)
      .then(async (token) => {
        const user = await fetchAuthMe(token);
        saveSession({
          token,
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          userRole: user.role as UserRole,
          isSystemAdmin: user.isSystemAdmin,
          mustChangePassword: false,
          projectId: null,
          projectName: null,
        });
        navigate("/projects", { replace: true });
      })
      .catch((err: unknown) => {
        clearFookieTokens();
        setError(err instanceof Error ? err.message : "Auth failed");
      });
  }, [navigate, params]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
        <p className="text-destructive">{error}</p>
        <button
          type="button"
          className="text-primary underline"
          onClick={() => navigate("/login", { replace: true })}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      Signing in…
    </div>
  );
}
