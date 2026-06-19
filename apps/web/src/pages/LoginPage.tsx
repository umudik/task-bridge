import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LogIn, Mail, KeyRound } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkAuthStatus, loginUser } from "@/lib/api";
import { loadSession, saveSession, type UserRole } from "@/lib/session";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const session = loadSession();
    if (session) {
      navigate(session.projectId ? `/projects/${session.projectId}/tasks` : "/projects", {
        replace: true,
      });
      return;
    }
    checkAuthStatus()
      .then(({ hasUsers }) => {
        if (!hasUsers) navigate("/setup", { replace: true });
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await loginUser({ email, password });
      saveSession({
        token: result.token,
        userId: result.user.id,
        userName: result.user.name,
        userEmail: result.user.email,
        userRole: result.user.role as UserRole,
        isSystemAdmin: result.user.isSystemAdmin,
      });
      navigate("/projects", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
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
            <BrandMark />
          </div>
          <div>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription className="mt-2">Enter your email and password to continue</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  className="pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSubmit(e as unknown as React.FormEvent);
                  }}
                />
              </div>
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
