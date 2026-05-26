import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import {
  resolveConnectTarget,
  type ConnectTarget,
} from "../services/connect-target.js";

function buildConnectUri(target: ConnectTarget): string {
  const params = new URLSearchParams({
    host: target.host,
    port: String(target.port),
    key: config.backendApiKey,
  });
  if (target.secure) {
    params.set("secure", "1");
  }
  return `taskbridge://connect?${params.toString()}`;
}

function waitingHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="2" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Task Bridge Connect</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 420px; margin: 2rem auto; padding: 0 1rem; text-align: center; }
    p { color: #444; line-height: 1.5; }
  </style>
</head>
<body>
  <h1>Task Bridge</h1>
  <p>Ngrok tunnel bekleniyor…</p>
  <p style="font-size:0.9rem;color:#666">Panel: <code>http://localhost:4040</code></p>
</body>
</html>`;
}

function setupHtml(target: ConnectTarget, connectUri: string): string {
  const endpoint = `https://${target.host}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Task Bridge Connect</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 420px; margin: 2rem auto; padding: 0 1rem; text-align: center; }
    #qrcode { display: inline-block; padding: 1rem; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
    code { word-break: break-all; font-size: 0.85rem; }
    p { color: #444; line-height: 1.5; }
  </style>
</head>
<body>
  <h1>Task Bridge</h1>
  <p>Mobilde <strong>Scan QR</strong> ile tara, sonra konuş.</p>
  <div id="qrcode"></div>
  <p>Endpoint: <code>${endpoint}</code></p>
  <p style="font-size:0.9rem;color:#666">Ngrok: <code>http://localhost:4040</code></p>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script>
    new QRCode(document.getElementById("qrcode"), {
      text: ${JSON.stringify(connectUri)},
      width: 256,
      height: 256,
    });
  </script>
</body>
</html>`;
}

export async function setupRoutes(app: FastifyInstance) {
  app.get("/connect.json", async (_request, reply) => {
    const target = await resolveConnectTarget();
    if (!target) {
      return reply.status(503).send({ error: "Ngrok tunnel not available" });
    }
    return {
      host: target.host,
      port: target.port,
      secure: target.secure,
      apiKey: config.backendApiKey,
      connectPath: "/setup",
      source: target.source,
    };
  });

  app.get("/setup", async (_request, reply) => {
    const target = await resolveConnectTarget();
    if (!target) {
      return reply.type("text/html").send(waitingHtml());
    }
    const connectUri = buildConnectUri(target);
    return reply.type("text/html").send(setupHtml(target, connectUri));
  });
}
