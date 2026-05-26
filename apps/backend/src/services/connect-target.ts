import { config } from "../config.js";

export type ConnectTarget = {
  host: string;
  port: number;
  secure: boolean;
  source: "ngrok";
};

type NgrokTunnelResponse = {
  tunnels?: Array<{ public_url?: string }>;
};

export async function resolveConnectTarget(): Promise<ConnectTarget | null> {
  if (!config.ngrokInspectorUrl) return null;

  try {
    const response = await fetch(`${config.ngrokInspectorUrl}/api/tunnels`);
    if (!response.ok) return null;
    const data = (await response.json()) as NgrokTunnelResponse;
    const httpsTunnel = data.tunnels?.find((tunnel) =>
      tunnel.public_url?.startsWith("https://"),
    );
    if (!httpsTunnel?.public_url) return null;
    const url = new URL(httpsTunnel.public_url);
    return {
      host: url.hostname,
      port: 443,
      secure: true,
      source: "ngrok",
    };
  } catch {
    return null;
  }
}
