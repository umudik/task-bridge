import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { toast } from "sonner";
import { SensitiveField } from "@/components/SensitiveField";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/hooks/useSession";
import {
  ApiError,
  buildMobileConnectUri,
  fetchConnectConfig,
} from "@/lib/api";
import { defaultBaseUrl } from "@/lib/session";

export function MobilePage() {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<Awaited<ReturnType<typeof fetchConnectConfig>> | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setConfig(await fetchConnectConfig(defaultBaseUrl()));
    } catch (err) {
      setConfig(null);
      setError(err instanceof ApiError ? err.message : "Tunnel not ready");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const endpoint = config
    ? `${config.secure ? "https" : "http"}://${config.host}${config.port && config.port !== 443 && config.port !== 80 ? `:${config.port}` : ""}`
    : null;
  const mobileUri = useMemo(
    () => (config ? buildMobileConnectUri(config, endpoint ?? defaultBaseUrl()) : null),
    [config, endpoint],
  );

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Mobile app</h1>
        <p className="mt-2 text-muted-foreground">
          Pair your phone here. QR and API key stay hidden until you reveal them.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Smartphone className="h-5 w-5 text-primary" />
              Scan QR
            </CardTitle>
            <CardDescription>For the Android app — not required for web sign-in.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {loading && !config ? (
              <div className="flex h-[272px] w-[272px] items-center justify-center rounded-xl border border-dashed">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : mobileUri ? (
              <div className="flex flex-col items-center gap-3">
                <div className="inline-flex shrink-0 rounded-xl bg-white p-4 shadow-sm">
                  <div className="size-[280px] shrink-0 [&_svg]:block [&_svg]:size-[280px] [&_svg]:max-h-[280px] [&_svg]:max-w-[280px]">
                    <QRCodeSVG value={mobileUri} size={280} level="L" includeMargin />
                  </div>
                </div>
                <p className="max-w-xs text-center text-xs text-muted-foreground">
                  Open the app, tap Scan QR, and hold steady for a few seconds.
                </p>
              </div>
            ) : (
              <Alert>
                <Wifi className="h-4 w-4" />
                <AlertTitle>Ngrok not ready</AlertTitle>
                <AlertDescription>{error ?? "Start docker and wait for the tunnel."}</AlertDescription>
              </Alert>
            )}
            <Button variant="outline" onClick={() => void refresh()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connection details</CardTitle>
            <CardDescription>Tap the eye icon to reveal, then copy if needed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <SensitiveField
              label="Web API key"
              value={session?.apiKey ?? "—"}
              onCopy={session?.apiKey ? () => void copy(session.apiKey, "API key") : undefined}
            />
            <SensitiveField
              label="Public endpoint"
              value={endpoint ?? "—"}
              onCopy={endpoint ? () => void copy(endpoint, "Endpoint") : undefined}
            />
            <SensitiveField
              label="Mobile deep link"
              value={mobileUri ?? "—"}
              onCopy={mobileUri ? () => void copy(mobileUri, "Deep link") : undefined}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
