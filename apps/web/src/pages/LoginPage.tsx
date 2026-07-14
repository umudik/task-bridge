import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { clearFookieTokens, getAccessToken, signInUrl } from "@/lib/auth";
import { fetchAuthMe } from "@/lib/api";
import { loadSession, saveSession, type UserRole } from "@/lib/session";

async function hydrateSessionFromToken(token: string): Promise<void> {
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
}

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const session = loadSession();
    if (session) {
      navigate(session.projectId ? `/projects/${session.projectId}/tasks` : "/projects", {
        replace: true,
      });
      return;
    }

    const token = getAccessToken();
    if (token) {
      void hydrateSessionFromToken(token)
        .then(() => {
          navigate("/projects", { replace: true });
        })
        .catch(() => {
          clearFookieTokens();
          void signInUrl()
            .then((href) => {
              window.location.href = href;
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Sign in failed");
            });
        });
      return;
    }

    void signInUrl()
      .then((href) => {
        window.location.href = href;
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Sign in failed");
      });
  }, [navigate]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
        <p className="text-destructive">{error}</p>
        <button
          type="button"
          className="text-primary underline"
          onClick={() => {
            setError("");
            void signInUrl()
              .then((href) => {
                window.location.href = href;
              })
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Sign in failed");
              });
          }}
        >
          Try again
        </button>
        <a href="https://fookiecloud.com" className="text-xs text-muted-foreground hover:underline">
          ← Fookie Cloud
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      Redirecting to Fookie…
    </div>
  );
}
