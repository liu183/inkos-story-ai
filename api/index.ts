import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

// ─── CORS helpers ────────────────────────────────────────────────
function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Service-Id");
}

function corsPreflight(req: VercelRequest, res: VercelResponse): boolean {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

// ─── Env vars ────────────────────────────────────────────────────
function getBaseUrl(): string {
  return process.env.SENSENOVA_BASE_URL ?? "https://token.sensenova.cn/v1";
}

function getApiKey(): string {
  const key = process.env.SENSENOVA_API_KEY;
  if (!key) throw new Error("SENSENOVA_API_KEY is not configured");
  return key;
}

function getDefaultModel(): string {
  return process.env.DEFAULT_MODEL ?? "deepseek-v4-flash";
}

function getOpenAIClient(): OpenAI {
  return new OpenAI({
    baseURL: getBaseUrl(),
    apiKey: getApiKey(),
  });
}

// ─── Available models ────────────────────────────────────────────
const AVAILABLE_MODELS = [
  { id: "deepseek-v4-flash", maxOutput: 393216, contextWindowTokens: 1_000_000, enabled: true, releasedAt: "2026-04-24" },
  { id: "sensenova-6.7-flash-lite", maxOutput: 8192, contextWindowTokens: 131072, enabled: true, releasedAt: "2025-01-01" },
  { id: "sensenova-u1-fast", maxOutput: 8192, contextWindowTokens: 65536, enabled: true, releasedAt: "2025-01-01" },
];

// ─── Service config ──────────────────────────────────────────────
function getServiceConfig() {
  return {
    id: "sensenova-proxy",
    label: "日日新代理",
    group: "aggregator",
    api: "openai-completions",
    baseUrl: getBaseUrl(),
    checkModel: getDefaultModel(),
    temperatureRange: [0, 2],
    defaultTemperature: 0.7,
    writingTemperature: 1,
    hasSecret: !!process.env.SENSENOVA_API_KEY,
  };
}

// ─── Route: /api/v1/services ────────────────────────────────────
function handleServices(res: VercelResponse) {
  const config = getServiceConfig();
  res.status(200).json([
    {
      id: config.id,
      label: config.label,
      group: config.group,
      hasSecret: config.hasSecret,
    },
  ]);
}

// ─── Route: /api/v1/services/config ─────────────────────────────
function handleServicesConfig(res: VercelResponse) {
  res.status(200).json(getServiceConfig());
}

// ─── Route: /api/v1/services/models ─────────────────────────────
function handleServicesModels(res: VercelResponse) {
  const config = getServiceConfig();
  res.status(200).json([
    {
      id: config.id,
      label: config.label,
      models: AVAILABLE_MODELS,
    },
  ]);
}

// ─── Route: /api/v1/services/:service/test ─────────────────────
async function handleServiceTest(service: string, res: VercelResponse) {
  if (service !== "sensenova-proxy") {
    res.status(404).json({ error: `Unknown service: ${service}` });
    return;
  }
  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: getDefaultModel(),
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 5,
    });
    res.status(200).json({ ok: true, model: response.model });
  } catch (err: any) {
    res.status(502).json({ ok: false, error: err.message ?? String(err) });
  }
}

// ─── Route: /api/v1/services/:service/secret ───────────────────
function handleServiceSecret(service: string, req: VercelRequest, res: VercelResponse) {
  if (service !== "sensenova-proxy") {
    res.status(404).json({ error: `Unknown service: ${service}` });
    return;
  }
  if (req.method === "GET") {
    res.status(200).json({ hasSecret: !!process.env.SENSENOVA_API_KEY });
    return;
  }
  if (req.method === "POST" || req.method === "PUT") {
    // In a serverless context we can't persist env changes, just acknowledge
    res.status(200).json({ ok: true });
    return;
  }
  if (req.method === "DELETE") {
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: "Method not allowed" });
}

// ─── Route: /api/v1/services/:service/models ───────────────────
function handleServiceModels(service: string, res: VercelResponse) {
  if (service !== "sensenova-proxy") {
    res.status(404).json({ error: `Unknown service: ${service}` });
    return;
  }
  res.status(200).json(AVAILABLE_MODELS);
}

// ─── Route: /api/v1/project ─────────────────────────────────────
function handleProject(method: string, req: VercelRequest, res: VercelResponse) {
  if (method === "GET") {
    res.status(200).json({
      language: "zh-CN",
      version: "1.3.6",
    });
    return;
  }
  res.status(405).json({ error: "Method not allowed" });
}

// ─── Route: /api/v1/project/language ────────────────────────────
function handleProjectLanguage(method: string, req: VercelRequest, res: VercelResponse) {
  if (method === "GET") {
    res.status(200).json({ language: "zh-CN" });
    return;
  }
  if (method === "POST" || method === "PUT") {
    res.status(200).json({ ok: true });
    return;
  }
  res.status(405).json({ error: "Method not allowed" });
}

// ─── Route: /api/v1/books ───────────────────────────────────────
function handleBooks(method: string, res: VercelResponse) {
  if (method === "GET") {
    res.status(200).json([]);
    return;
  }
  res.status(405).json({ error: "Method not allowed" });
}

// ─── Route: /api/v1/chat/completions (OpenAI proxy) ─────────────
async function handleChatCompletions(req: VercelRequest, res: VercelResponse) {
  try {
    const body = req.body;
    if (!body || !body.messages) {
      res.status(400).json({ error: "Missing 'messages' in request body" });
      return;
    }

    const client = getOpenAIClient();
    const model = body.model ?? getDefaultModel();

    const completion = await client.chat.completions.create({
      model,
      messages: body.messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      stream: body.stream ?? false,
    });

    if (body.stream) {
      res.status(200).setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // TypeScript cast for streaming response
      const stream = completion as unknown as AsyncIterable<any>;
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      res.status(200).json(completion);
    }
  } catch (err: any) {
    const status = err.status ?? err.statusCode ?? 502;
    res.status(status).json({
      error: {
        message: err.message ?? String(err),
        type: "proxy_error",
      },
    });
  }
}

// ─── Router ──────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (corsPreflight(req, res)) return;
  setCors(res);

  const { url, method } = req;
  // Vercel passes the path as query param via rewrites, or we can parse from url
  const path = (req.query?.[0] as string) ?? (url?.split("/api/v1")[1] ?? "").replace(/^\//, "");
  const segments = path.split("/").filter(Boolean);

  try {
    // ── /services ─────────────────────────────
    if (segments[0] === "services" && !segments[1]) {
      handleServices(res);
      return;
    }

    // ── /services/config ──────────────────────
    if (segments[0] === "services" && segments[1] === "config") {
      handleServicesConfig(res);
      return;
    }

    // ── /services/models ──────────────────────
    if (segments[0] === "services" && segments[1] === "models") {
      handleServicesModels(res);
      return;
    }

    // ── /services/:service/test ───────────────
    if (segments[0] === "services" && segments[2] === "test") {
      await handleServiceTest(segments[1], res);
      return;
    }

    // ── /services/:service/secret ─────────────
    if (segments[0] === "services" && segments[2] === "secret") {
      handleServiceSecret(segments[1], req, res);
      return;
    }

    // ── /services/:service/models ─────────────
    if (segments[0] === "services" && segments[2] === "models") {
      handleServiceModels(segments[1], res);
      return;
    }

    // ── /project ──────────────────────────────
    if (segments[0] === "project" && !segments[1]) {
      handleProject(method ?? "GET", req, res);
      return;
    }

    // ── /project/language ─────────────────────
    if (segments[0] === "project" && segments[1] === "language") {
      handleProjectLanguage(method ?? "GET", req, res);
      return;
    }

    // ── /books ────────────────────────────────
    if (segments[0] === "books") {
      handleBooks(method ?? "GET", res);
      return;
    }

    // ── /chat/completions (proxy) ─────────────
    if (segments[0] === "chat" && segments[1] === "completions") {
      await handleChatCompletions(req, res);
      return;
    }

    // ── Fallback ──────────────────────────────
    res.status(404).json({ error: `Not found: ${path}` });
  } catch (err: any) {
    console.error("API error:", err);
    res.status(500).json({ error: err.message ?? "Internal server error" });
  }
}
