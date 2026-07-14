import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clearFookieTokens, getAccessToken, signInUrl } from "@/lib/auth";
import { fetchAuthMe } from "@/lib/api";
import { loadSession, saveSession, type UserRole } from "@/lib/session";

const FOOKIE_CLOUD = "https://fookiecloud.com";

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
  const [loading, setLoading] = useState(true);

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
          setLoading(false);
        });
      return;
    }

    setLoading(false);
  }, [navigate]);

  async function handleSignIn() {
    setError("");
    setLoading(true);
    try {
      const href = await signInUrl();
      window.location.href = href;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md border-white/[0.08] bg-card shadow-2xl">
        <CardHeader className="space-y-6 text-center">
          <div className="flex justify-center">
            <BrandMark className="h-12 w-12" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl">Task Bridge</CardTitle>
            <CardDescription>Sign in with your Fookie Cloud account</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-destructive text-center">{error}</p> : null}
          <Button className="w-full" onClick={() => void handleSignIn()}>
            Continue with Fookie
          </Button>
          <a
            href={FOOKIE_CLOUD}
            className="block text-center text-xs text-muted-foreground hover:text-foreground"
          >
            ← Fookie Cloud
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
