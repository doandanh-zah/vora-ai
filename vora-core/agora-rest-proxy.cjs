#!/usr/bin/env node

const http = require("http");

const PORT = Number(process.env.PORT || 8787);
const TARGET_BASE = "https://api.agora.io";
const API_PREFIX = "/api/conversational-ai-agent/v2";

function applyCors(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = req.url || "";
  if (!(reqUrl === API_PREFIX || reqUrl.startsWith(`${API_PREFIX}/`))) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found", expectedPrefix: API_PREFIX }));
    return;
  }

  const authorization = req.headers.authorization;
  if (!authorization) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing Authorization header" }));
    return;
  }

  try {
    const body = await readBody(req);
    const targetUrl = `${TARGET_BASE}${reqUrl}`;
    const method = req.method || "GET";

    const headers = {
      Authorization: authorization,
      "Content-Type": req.headers["content-type"] || "application/json",
    };

    const upstreamResponse = await fetch(targetUrl, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
    });

    const contentType = upstreamResponse.headers.get("content-type");
    const text = await upstreamResponse.text();

    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    res.writeHead(upstreamResponse.status);
    res.end(text);
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Proxy request failed", detail: error.message }));
  }
}

http
  .createServer((req, res) => {
    void handler(req, res);
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`[agora-rest-proxy] listening on http://127.0.0.1:${PORT}`);
    console.log(`[agora-rest-proxy] forwarding ${API_PREFIX} -> ${TARGET_BASE}${API_PREFIX}`);
  });
