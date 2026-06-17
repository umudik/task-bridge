import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Loader2, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import { SensitiveField, SensitiveReveal } from "@/components/SensitiveField";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { ApiError, buildMobileConnectUri, fetchConnectConfig } from "@/lib/api";
import { defaultBaseUrl } from "@/lib/session";

export function MobilePage() {
  const { projectId } = useParams();
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<Awaited<ReturnType<typeof fetchConnectConfig>> | null>(null);
  const [apkRelease, setApkRelease] = useState<{
    available: boolean;
    downloadUrl?: string;
    sizeBytes?: number;
    fileName?: string;
  } | null>(null);

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

  useEffect(() => {
    let active = true;
    async function loadApkRelease() {
      try {
        const response = await fetch(`${defaultBaseUrl()}/mobile/release`);
        if (!response.ok) return;
        const data = (await response.json()) as {
          available: boolean;
          downloadUrl?: string;
          sizeBytes?: number;
          fileName?: string;
        };
        if (active) setApkRelease(data);
      } catch {
        if (active) setApkRelease({ available: false });
      }
    }
    void loadApkRelease();
    return () => {
      active = false;
    };
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
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        breadcrumb={[
          { label: "Projects", to: "/projects" },
          { label: session?.projectName ?? projectId ?? "Project", to: `/projects/${projectId}/tasks` },
          { label: "Mobile" },
        ]}
        title="Mobile"
        subtitle="Android pairing"
        actions={
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-xl space-y-8">
          <div className="panel-card space-y-6 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-white">Sensitive details</p>
                <p className="text-sm text-muted-foreground">QR and connection details are hidden by default.</p>
              </div>
            </div>

            {loading && !config ? (
              <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-white/[0.08]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : mobileUri ? (
              <SensitiveReveal label="Show QR code" hideLabel="Hide QR">
                <div className="flex flex-col items-center gap-4">
                  <div className="inline-flex rounded-2xl bg-white p-4 shadow-sm">
                    <QRCodeSVG value={mobileUri} size={240} level="L" includeMargin />
                  </div>
                  <p className="text-center text-xs leading-relaxed text-muted-foreground">
                    Scan the QR code in the mobile app.
                  </p>
                </div>
              </SensitiveReveal>
            ) : (
              <Alert>
                <Wifi className="h-4 w-4" />
                <AlertTitle>Ngrok not ready</AlertTitle>
                <AlertDescription>{error ?? "Start Docker and wait for the tunnel."}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
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
            </div>
          </div>

          {apkRelease?.available && apkRelease.downloadUrl ? (
            <div className="panel-card space-y-4 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild>
                  <a href={`${defaultBaseUrl()}${apkRelease.downloadUrl}`} download={apkRelease.fileName}>
                    <Download className="mr-2 h-4 w-4" />
                    Download APK
                  </a>
                </Button>
                {apkRelease.sizeBytes ? (
                  <span className="text-sm text-muted-foreground">
                    {(apkRelease.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
