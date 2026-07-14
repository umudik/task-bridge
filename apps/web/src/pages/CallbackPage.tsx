import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { clearFookieTokens, exchangeCode } from "@/lib/auth";
import { fetchAuthMe } from "@/lib/api";
import { saveSession, type UserRole } from "@/lib/session";
import { FookieCloudMark } from "@/components/FookieCloudMark";

function Splash(props: { subtitle: string; error?: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground animate-pulse">
        T
      </div>
      <div className="space-y-1.5">
        <div className="text-lg font-semibold tracking-tight">Task Bridge</div>
        <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <span>by</span>
          <FookieCloudMark size="md" className="inline-flex items-baseline gap-0 text-sm font-semibold tracking-tight" />
        </div>
        {props.error ? (
          <p className="pt-2 text-sm text-destructive">{props.error}</p>
        ) : (
          <p className="pt-2 text-xs text-muted-foreground">{props.subtitle}</p>
        )}
      </div>
      {props.onRetry ? (
        <button type="button" className="text-sm text-primary underline" onClick={props.onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

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
      <Splash
        subtitle=""
        error={error}
        onRetry={() => navigate("/login", { replace: true })}
      />
    );
  }

  return <Splash subtitle="Signing in…" />;
}
