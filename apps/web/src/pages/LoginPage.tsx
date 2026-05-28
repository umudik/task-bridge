import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, KeyRound, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateSession } from "@/lib/api";
import {
  buildBaseUrl,
  defaultBaseUrl,
  loadSession,
  parseHostPort,
  saveSession,
  sessionFromOrigin,
  type Session,
} from "@/lib/session";

export function LoginPage() {
  const navigate = useNavigate();
  const existing = loadSession();
  const parsed = existing ? parseHostPort(existing.baseUrl) : parseHostPort(defaultBaseUrl());

  const [apiKey, setApiKey] = useState(existing?.apiKey ?? "dev-key");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [host, setHost] = useState(parsed.host);
  const [port, setPort] = useState(parsed.port === "443" || parsed.port === "80" ? "3001" : parsed.port);
  const [useHttps, setUseHttps] = useState(parsed.useHttps);
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    try {
      const session: Session = showAdvanced
        ? {
            baseUrl: buildBaseUrl(host, port, useHttps),
            apiKey: apiKey.trim(),
            useHttps,
          }
        : sessionFromOrigin(apiKey);
      await validateSession(session);
      saveSession(session);
      toast.success("Signed in");
      navigate("/projects", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign in failed — check API key");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface-grid flex min-h-full items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md border-primary/15 bg-card/95 shadow-xl backdrop-blur">
        <CardHeader className="space-y-6 text-center">
          <div className="flex justify-center">
            <BrandMark />
          </div>
          <div>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription className="mt-2">
              Web dashboard — same bridge as mobile, without voice.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-center text-sm text-muted-foreground">
            Server: <span className="font-medium text-foreground">{defaultBaseUrl()}</span>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiKey">API key</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="apiKey"
                type="password"
                className="pl-10"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="dev-key"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void signIn();
                }}
              />
            </div>
          </div>

          <Button className="h-11 w-full" disabled={loading || !apiKey.trim()} onClick={() => void signIn()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Sign in
          </Button>

          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowAdvanced((value) => !value)}
          >
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showAdvanced ? "Hide remote server" : "Remote server settings"}
          </button>

          {showAdvanced ? (
            <div className="grid gap-3 rounded-xl border bg-background/60 p-4">
              <div className="grid gap-2">
                <Label htmlFor="host">Host</Label>
                <Input id="host" value={host} onChange={(event) => setHost(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="port">Port</Label>
                <Input id="port" value={port} onChange={(event) => setPort(event.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={useHttps}
                  onChange={(event) => setUseHttps(event.target.checked)}
                  className="rounded border-input"
                />
                HTTPS
              </label>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
