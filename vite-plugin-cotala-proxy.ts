import type { IncomingMessage, ServerResponse } from "http";
import type { Plugin } from "vite";

const CANADA_ORIGIN = "https://appslure.app";
const CANADA_PORTAL = "https://appslure.app/cotalacustomer/";
const API_PREFIX = "/cotalacustomer/api";
const LOCAL_PREFIX = "/cotala-api";
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const cookieJar = new Map<string, string>();

function cookieHeader() {
  return Array.from(cookieJar.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
}

function rememberCookies(res: Response) {
  const raw =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  for (const item of raw) {
    const pair = item.split(";", 1)[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function canadaHeaders(req: IncomingMessage, json = true): Record<string, string> {
  const headers: Record<string, string> = {
    accept: json ? "application/json, text/plain, */*" : "text/html,application/xhtml+xml",
    "accept-language": "en-CA,en;q=0.9",
    origin: CANADA_ORIGIN,
    referer: CANADA_PORTAL,
    "user-agent": req.headers["user-agent"] || CHROME_UA,
  };
  const cookies = cookieHeader();
  if (cookies) headers.cookie = cookies;
  const contentType = req.headers["content-type"];
  if (contentType) headers["content-type"] = String(contentType);
  return headers;
}

async function readBody(req: IncomingMessage) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function warmupPortal(req: IncomingMessage) {
  try {
    const res = await fetch(CANADA_PORTAL, {
      headers: canadaHeaders(req, false),
    });
    rememberCookies(res);
  } catch {
    // Portal warmup is best-effort; API call still proceeds.
  }
}

async function proxyRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
    res.end();
    return;
  }

  const url = new URL(req.url || "/", "http://localhost");
  const apiPath = url.pathname.replace(new RegExp(`^${LOCAL_PREFIX}`), API_PREFIX) + url.search;
  const target = `${CANADA_ORIGIN}${apiPath}`;

  if (cookieJar.size === 0) {
    await warmupPortal(req);
  }

  const body = await readBody(req);
  const upstream = await fetch(target, {
    method: req.method,
    headers: canadaHeaders(req, true),
    body,
  });
  rememberCookies(upstream);

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.statusCode = upstream.status;
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.setHeader("content-type", contentType);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end(buf);
}

export function cotalaCanadaProxy(): Plugin {
  return {
    name: "cotala-canada-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(LOCAL_PREFIX)) {
          next();
          return;
        }
        try {
          await proxyRequest(req, res);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ status: false, msg: "Canada API proxy failed" }));
        }
      });
    },
  };
}
