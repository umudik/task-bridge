import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const SERVICE = "task-bridge";

type Labels = {
  service: string;
  method: string;
  route: string;
  status_class: string;
};

const requestCounts = new Map<string, number>();
const durationSums = new Map<string, number>();
const durationCounts = new Map<string, number>();
let inFlight = 0;

function keyOf(l: Labels): string {
  return `${l.service}|${l.method}|${l.route}|${l.status_class}`;
}

function statusClass(code: number): string {
  if (code >= 500) return "5xx";
  if (code >= 400) return "4xx";
  if (code >= 300) return "3xx";
  if (code >= 200) return "2xx";
  return "1xx";
}

function normalizeRoute(url: string): string {
  const path = url.split("?")[0] ?? "/";
  return path
    .split("/")
    .map((p) => {
      if (p.length === 0) return p;
      if (/^[0-9a-f-]{8,}$/i.test(p) || /^\d+$/.test(p)) return ":id";
      return p;
    })
    .join("/");
}

function clientIp(req: FastifyRequest): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) {
    return xf.split(",")[0]?.trim() ?? req.ip;
  }
  if (Array.isArray(xf) && xf[0]) {
    return xf[0].split(",")[0]?.trim() ?? req.ip;
  }
  return req.ip;
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function renderMetrics(): string {
  const lines: string[] = [
    "# HELP http_requests_total Total HTTP requests",
    "# TYPE http_requests_total counter",
  ];
  for (const [k, n] of requestCounts) {
    const [service, method, route, status_class] = k.split("|");
    lines.push(
      `http_requests_total{service="${escapeLabel(service ?? "")}",method="${escapeLabel(method ?? "")}",route="${escapeLabel(route ?? "")}",status_class="${escapeLabel(status_class ?? "")}"} ${n}`,
    );
  }
  lines.push(
    "# HELP http_request_duration_seconds HTTP request duration",
    "# TYPE http_request_duration_seconds summary",
  );
  for (const [k, sum] of durationSums) {
    const count = durationCounts.get(k) ?? 0;
    const [service, method, route, status_class] = k.split("|");
    const labels = `service="${escapeLabel(service ?? "")}",method="${escapeLabel(method ?? "")}",route="${escapeLabel(route ?? "")}",status_class="${escapeLabel(status_class ?? "")}"`;
    lines.push(`http_request_duration_seconds_sum{${labels}} ${sum}`);
    lines.push(`http_request_duration_seconds_count{${labels}} ${count}`);
  }
  lines.push(
    "# HELP http_requests_in_flight In-flight HTTP requests",
    "# TYPE http_requests_in_flight gauge",
    `http_requests_in_flight{service="${SERVICE}"} ${inFlight}`,
  );
  return `${lines.join("\n")}\n`;
}

export async function registerObservability(app: FastifyInstance): Promise<void> {
  app.get("/metrics", async (_req, reply) => {
    reply.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return renderMetrics();
  });

  app.addHook("onRequest", async (req) => {
    if (req.url.startsWith("/metrics") || req.url.startsWith("/health")) {
      return;
    }
    inFlight += 1;
    (req as FastifyRequest & { __obsStart?: bigint }).__obsStart = process.hrtime.bigint();
  });

  app.addHook("onResponse", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url.startsWith("/metrics") || req.url.startsWith("/health")) {
      return;
    }
    inFlight = Math.max(0, inFlight - 1);
    const start = (req as FastifyRequest & { __obsStart?: bigint }).__obsStart;
    const durMs =
      start === undefined ? 0 : Number(process.hrtime.bigint() - start) / 1e6;
    const route = normalizeRoute(req.url);
    const sc = statusClass(reply.statusCode);
    const labels: Labels = {
      service: SERVICE,
      method: req.method,
      route,
      status_class: sc,
    };
    const k = keyOf(labels);
    requestCounts.set(k, (requestCounts.get(k) ?? 0) + 1);
    durationSums.set(k, (durationSums.get(k) ?? 0) + durMs / 1000);
    durationCounts.set(k, (durationCounts.get(k) ?? 0) + 1);
    const line = {
      msg: "http_access",
      service: SERVICE,
      client_ip: clientIp(req),
      method: req.method,
      path: req.url.split("?")[0] ?? "/",
      status: reply.statusCode,
      duration_ms: Math.round(durMs * 100) / 100,
      request_id: req.id,
    };
    process.stdout.write(`${JSON.stringify(line)}\n`);
  });
}
