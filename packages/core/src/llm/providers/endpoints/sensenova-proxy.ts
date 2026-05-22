/**
 * 日日新 Token 代理 (SenseNova Token Proxy)
 *
 * 聚合了 SenseNova 和 DeepSeek 模型的代理端点
 * Base URL: https://token.sensenova.cn/v1
 */
import type { InkosEndpoint } from "../types.js";

export const SENSENOVA_PROXY: InkosEndpoint = {
  id: "sensenova-proxy",
  label: "日日新代理",
  group: "aggregator",
  api: "openai-completions",
  baseUrl: "https://token.sensenova.cn/v1",
  checkModel: "deepseek-v4-flash",
  temperatureRange: [0, 2],
  defaultTemperature: 0.7,
  writingTemperature: 1,
  models: [
    { id: "deepseek-v4-flash", maxOutput: 393216, contextWindowTokens: 1_000_000, enabled: true, releasedAt: "2026-04-24" },
    { id: "sensenova-6.7-flash-lite", maxOutput: 8192, contextWindowTokens: 131072, enabled: true, releasedAt: "2025-01-01" },
    { id: "sensenova-u1-fast", maxOutput: 8192, contextWindowTokens: 65536, enabled: true, releasedAt: "2025-01-01" },
  ],
};
