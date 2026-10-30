const { Readable } = require("node:stream");

const UPSTREAM = "https://integrate.api.nvidia.com";
// Matches vercel.json maxDuration; aborting a bit earlier returns JSON instead of Vercel's bare 503.
const UPSTREAM_TIMEOUT_MS = 295_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept"
};

function sendJson(res, status, payload) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (Buffer.isBuffer(req.body) || typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function forward(upstreamPath, defaultAccept) {
  return async function handler(req, res) {
    if (req.method === "OPTIONS") {
      Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
      res.statusCode = 204;
      res.end();
      return;
    }

    const auth = req.headers.authorization;
    if (!auth) {
      sendJson(res, 401, { error: { message: "Missing Authorization header" } });
      return;
    }

    let body;
    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        body = await readBody(req);
      } catch (e) {
        sendJson(res, 400, { error: { message: `Failed to read request body: ${e.message}` } });
        return;
      }
      if (body.length === 0) {
        sendJson(res, 400, { error: { message: "Empty request body" } });
        return;
      }
    }

    const incoming = new URL(req.url, "http://internal");
    const target = new URL(upstreamPath, UPSTREAM);
    incoming.searchParams.forEach((value, key) => target.searchParams.append(key, value));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    let upstream;
    try {
      upstream = await fetch(target, {
        method: req.method,
        headers: {
          Authorization: auth,
          "Content-Type": req.headers["content-type"] || "application/json",
          Accept: req.headers.accept || defaultAccept
        },
        body,
        signal: controller.signal
      });
    } catch (e) {
      const message =
        e.name === "AbortError"
          ? "Upstream timeout: NVIDIA did not respond in time"
          : `Upstream error: ${e.message}`;
      sendJson(res, 502, { error: { message } });
      return;
    } finally {
      clearTimeout(timer);
    }

    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    if (!upstream.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstream.body).pipe(res);
  };
}

module.exports = { forward };
