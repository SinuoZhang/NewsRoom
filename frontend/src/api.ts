const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export type Source = {
  id: number;
  name: string;
  rss_url: string;
  category: string;
  is_active: boolean;
};

export type Analysis = {
  summary: string;
  topic: string;
  sentiment: string;
  impact_scope: string;
  short_term_outlook: string;
  mid_term_outlook: string;
  risk_points: string[];
  opportunity_points: string[];
  confidence: number;
  model: string;
};

export type News = {
  id: number;
  source_id: number;
  source_name: string;
  source_timezone: string;
  title: string;
  url: string;
  content: string;
  published_at: string | null;
  collected_at: string;
  impact_score: number;
  topic: string | null;
  sentiment: string | null;
  analysis?: Analysis;
};

export type DailyOutlook = {
  generated_at: string;
  coverage_count: number;
  topics: Record<string, number>;
  sentiment: Record<string, number>;
  highlights: string[];
};

export type SeedResult = {
  inserted: number;
  updated: number;
  removed: number;
  skipped_invalid: number;
  active: number;
};

export type CollectResult = {
  source_count: number;
  fetched_count: number;
  inserted_count: number;
  duplicate_count: number;
  pruned?: {
    news: number;
    raw_news: number;
    analysis: number;
  };
};

export type CollectStatus = {
  running: boolean;
  reason: string | null;
  started_at: string | null;
  finished_at: string | null;
  source_total: number;
  source_done: number;
  current_source: string | null;
  fetched_count: number;
  inserted_count: number;
  duplicate_count: number;
  last_result: CollectResult | null;
  last_error: string | null;
  retention_days: number;
  pruned: {
    news: number;
    raw_news: number;
    analysis: number;
  };
};

export type NewsCount = {
  total: number;
};

export type RegionCounts = {
  north_america: number;
  europe: number;
  middle_east: number;
  australia: number;
  africa: number;
  neutral_zone: number;
  east_asia: number;
  greater_china: number;
  se_asia: number;
  other: number;
  all: number;
};

export type LlmChatIn = {
  message: string;
  mode: "filtered" | "all" | "selected";
  use_news_context?: boolean;
  ui_lang?: "zh" | "en" | "de";
  use_chat_history?: boolean;
  history_turns?: number;
  q?: string;
  source_id?: number;
  region?: string;
  news_ids?: number[];
  limit?: number;
};

export type LlmChatOut = {
  answer: string;
  provider: string;
  model: string;
  used_news_count: number;
};

export type LlmModelsOut = {
  provider: string;
  current_model: string;
  models: string[];
  can_switch: boolean;
};

export type LlmConfigOut = {
  provider: string;
  current_model: string;
  openai_model: string;
  gemini_model: string;
  ollama_model: string;
  ollama_available: boolean;
  openai_configured: boolean;
  gemini_configured: boolean;
};

export type LlmConfigIn = {
  provider: "ollama" | "openai" | "gemini";
  model?: string;
  openai_api_key?: string;
  openai_model?: string;
  gemini_api_key?: string;
  gemini_model?: string;
  persist?: boolean;
};

export type LlmSelectNewsIn = {
  instruction: string;
  mode: "filtered" | "all" | "selected";
  q?: string;
  source_id?: number;
  region?: string;
  news_ids?: number[];
  limit?: number;
};

export type LlmSelectNewsOut = {
  selected_ids: number[];
  selected_items: Array<{
    id: number;
    title: string;
    source: string;
    url: string;
    published_at: string | null;
  }>;
  provider: string;
  model: string;
  scanned_news_count: number;
  reason: string;
};

export type LlmRefineRerunIn = {
  message: string;
  previous_answer: string;
  mode: "filtered" | "all" | "selected";
  use_news_context?: boolean;
  ui_lang?: "zh" | "en" | "de";
  use_chat_history?: boolean;
  history_turns?: number;
  q?: string;
  source_id?: number;
  region?: string;
  news_ids?: number[];
  limit?: number;
};

export type LlmRefineRerunOut = {
  answer: string;
  provider: string;
  model: string;
  used_news_count: number;
  selected_ids: number[];
  added_ids: number[];
  selected_items: Array<{
    id: number;
    title: string;
    source: string;
    url: string;
    published_at: string | null;
  }>;
  keywords: string[];
  missing_points: string[];
};

export type LlmMemoryItem = {
  ts: string;
  role: "user" | "assistant" | "system";
  text: string;
  provider?: string;
  model?: string;
};

export type MarketItem = {
  key: string;
  label: string;
  symbol: string;
  source: string;
  source_url?: string | null;
  price: number | null;
  unit: string;
  change_pct: number | null;
  updated_at: string;
};

export type MarketSnapshot = {
  source: string;
  updated_at: string;
  items: MarketItem[];
};

export type FinanceHeadline = {
  id: number;
  source_name: string;
  title: string;
  url: string;
  published_at: string | null;
};

export type TranslateIn = {
  text: string;
  source_lang?: string;
  target_lang: string;
};

export type TranslateOut = {
  translated_text: string;
  source_lang: string;
  target_lang: string;
  provider: string;
};

export type OwidPoint = {
  entity: string;
  code: string | null;
  year: number;
  value: number;
};

export type OwidSeries = {
  indicator: string;
  entity: string | null;
  source_url: string;
  unit: string | null;
  points: OwidPoint[];
  fetched_at: string;
};

export type OwidRandomModule = {
  indicator: string;
  entity: string;
  title: string;
  source_url: string;
  page_url: string;
  unit: string | null;
  points: OwidPoint[];
  fetched_at: string;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

async function requestWithTimeout<T>(path: string, options: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await request<T>(path, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export const api = {
  seedSources: () => request<SeedResult>("/api/sources/seed", { method: "POST" }),
  getSources: () => request<Source[]>("/api/sources"),
  getNews: (params: { q?: string; source_id?: number; region?: string; after_id?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.source_id) query.set("source_id", String(params.source_id));
    if (params.region) query.set("region", params.region);
    if (params.after_id) query.set("after_id", String(params.after_id));
    if (params.limit) query.set("limit", String(params.limit));
    return request<News[]>(`/api/news?${query.toString()}`);
  },
  getNewsCount: (params: { q?: string; source_id?: number; region?: string }) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.source_id) query.set("source_id", String(params.source_id));
    if (params.region) query.set("region", params.region);
    return request<NewsCount>(`/api/news/count?${query.toString()}`);
  },
  getNewsByIds: (ids: number[]) => {
    const query = new URLSearchParams();
    ids.forEach((id) => query.append("ids", String(id)));
    return request<News[]>(`/api/news/by-ids?${query.toString()}`);
  },
  getRegionCounts: () => request<RegionCounts>("/api/news/region-counts"),
  collectNews: () => request<CollectResult>("/api/collect/run", { method: "POST" }),
  getCollectStatus: () => request<CollectStatus>("/api/collect/status"),
  llmChat: async (payload: LlmChatIn) => {
    try {
      return await requestWithTimeout<LlmChatOut>("/api/llm/chat", { method: "POST", body: JSON.stringify(payload) }, 420000);
    } catch {
      const reduced = { ...payload, limit: Math.min(payload.limit || 8, 8) };
      return requestWithTimeout<LlmChatOut>("/api/llm/chat", { method: "POST", body: JSON.stringify(reduced) }, 180000);
    }
  },
  llmSelectNews: (payload: LlmSelectNewsIn) =>
    requestWithTimeout<LlmSelectNewsOut>("/api/llm/select-news", { method: "POST", body: JSON.stringify(payload) }, 420000),
  llmRefineRerun: (payload: LlmRefineRerunIn) =>
    requestWithTimeout<LlmRefineRerunOut>("/api/llm/refine-rerun", { method: "POST", body: JSON.stringify(payload) }, 420000),
  llmSelectIntent: (instruction: string, recent_messages: Array<{ role: string; text: string }> = []) =>
    request<{ operation: string; reason: string; provider: string; model: string }>("/api/llm/select-intent", {
      method: "POST",
      body: JSON.stringify({ instruction, recent_messages })
    }),
  getLlmModels: () => request<LlmModelsOut>("/api/llm/models"),
  selectLlmModel: (model: string) => request<LlmModelsOut>("/api/llm/models/select", { method: "POST", body: JSON.stringify({ model }) }),
  getLlmConfig: () => request<LlmConfigOut>("/api/llm/config"),
  setLlmConfig: (payload: LlmConfigIn) => request<LlmConfigOut>("/api/llm/config", { method: "POST", body: JSON.stringify(payload) }),
  getLlmMemory: () => request<{ items: LlmMemoryItem[] }>("/api/llm/memory?hours=24"),
  clearLlmMemory: () => request<{ cleared: boolean }>("/api/llm/memory", { method: "DELETE" }),
  getMarketSnapshot: (force = false) => request<MarketSnapshot>(`/api/market/snapshot?force=${force ? "true" : "false"}`),
  getOwidSeries: (params: { indicator: string; entity?: string; limit?: number }) => {
    const query = new URLSearchParams();
    query.set("indicator", params.indicator);
    if (params.entity) query.set("entity", params.entity);
    if (params.limit) query.set("limit", String(params.limit));
    return request<OwidSeries>(`/api/owid/series?${query.toString()}`);
  },
  getOwidRandomModules: (count = 10, pointsLimit = 40) =>
    request<OwidRandomModule[]>(`/api/owid/random?count=${count}&points_limit=${pointsLimit}`),
  translateText: (payload: TranslateIn) =>
    requestWithTimeout<TranslateOut>("/api/translate", { method: "POST", body: JSON.stringify(payload) }, 45000),
  getFinanceHeadlines: (limit = 8) => request<FinanceHeadline[]>(`/api/market/finance-news?limit=${limit}`),
  analyzeNews: (id: number) => request(`/api/analyze/${id}`, { method: "POST" }),
  getDailyOutlook: () => request<DailyOutlook>("/api/daily-outlook")
};
