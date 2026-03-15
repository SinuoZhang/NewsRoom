import { type KeyboardEvent, type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  CollectResult,
  CollectStatus,
  LlmChatOut,
  LlmModelsOut,
  LlmRefineRerunOut,
  LlmSelectNewsOut,
  MarketSnapshot,
  News,
  OwidRandomModule,
  RegionCounts,
  SeedResult,
  Source,
} from "./api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-basic-dist-min";

const Plot = createPlotlyComponent(Plotly as never);

type RegionKey = "all" | "north_america" | "europe" | "middle_east" | "australia" | "africa" | "neutral_zone" | "east_asia" | "greater_china" | "se_asia";
type Lang = "zh" | "en" | "de";
type PageTab = "dashboard" | "owid" | "stats";
type RegionBucketKey = Exclude<RegionKey, "all"> | "other";

type RefreshStat = {
  ts: string;
  trigger: "manual" | "auto" | "collect";
  added: number;
  visible: number;
  total: number;
  q: string;
  source_id: number | null;
  region: RegionKey;
  selected_count: number;
  fetched_count: number | null;
  inserted_count: number | null;
  duplicate_count: number | null;
  source_done: number | null;
  source_total: number | null;
  current_source: string | null;
  added_by_region: Record<RegionBucketKey, number>;
};

type OwidModuleCard = OwidRandomModule;

type SelectOp = "replace" | "append" | "remove" | "refine";
type SelectOpMode = "auto" | SelectOp;
type MarketRange = "15m" | "1h" | "6h" | "24h" | "all";
type MarketHistoryPoint = { ts: string; price: number };


const formatOptions: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
};

function toUtcDate(value: string | null): Date | null {
  if (!value) return null;
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(value);
  const iso = hasZone ? value : `${value}Z`;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function regionLabel(region: RegionKey | RegionBucketKey, lang: Lang): string {
  if (lang === "zh") {
    if (region === "all") return "全部";
    if (region === "north_america") return "北美";
    if (region === "europe") return "欧洲";
    if (region === "middle_east") return "中东";
    if (region === "australia") return "澳洲";
    if (region === "africa") return "非洲";
    if (region === "neutral_zone") return "中立区";
    if (region === "east_asia") return "东亚";
    if (region === "greater_china") return "大中华";
    if (region === "se_asia") return "东南亚";
    return "其他";
  }
  if (region === "all") return "All";
  if (region === "north_america") return "North America";
  if (region === "europe") return "Europe";
  if (region === "middle_east") return "Middle East";
  if (region === "australia") return "Australia";
  if (region === "africa") return "Africa";
  if (region === "neutral_zone") return "Neutral Zone";
  if (region === "east_asia") return "East Asia";
  if (region === "greater_china") return "Greater China";
  if (region === "se_asia") return "Southeast Asia";
  return "Other";
}

function inferRegionFromSourceName(sourceName: string): RegionBucketKey {
  const text = (sourceName || "").toLowerCase();
  if (/(nytimes|npr|cnbc|wsj|wall street journal|bloomberg|marketwatch|yahoo finance|techcrunch|the verge|ars technica|wired)/.test(text)) return "north_america";
  if (/(abc australia|guardian australia)/.test(text)) return "australia";
  if (/(bbc|financial times|ft global|guardian|economist|telegraph|independent|reuters|dw|spiegel|tagesschau|france24|rfi)/.test(text)) return "europe";
  if (/(al jazeera|middle east eye|haaretz)/.test(text)) return "middle_east";
  if (/(africanews|allafrica)/.test(text)) return "africa";
  if (/(nzz|lux times|luxemburger wort|le news switzerland)/.test(text)) return "neutral_zone";
  if (/(japan times|nhk|japan|yonhap|korea times)/.test(text)) return "east_asia";
  if (/(xinhua|people|caixin|36kr|ifeng|bbc chinese|dw chinese|sina|netease|chinanews|udn|hkfp|rthk|taipei times|rti taiwan|liberty times)/.test(text)) return "greater_china";
  if (/(straits times|cna singapore|jakarta post|bangkok post|star malaysia|malay mail)/.test(text)) return "se_asia";
  return "other";
}

function inferCountryFromSourceName(sourceName: string): string {
  const text = (sourceName || "").toLowerCase();
  if (/(nytimes|npr|cnbc|wsj|wall street journal|bloomberg|marketwatch|yahoo finance|techcrunch|the verge|ars technica|wired)/.test(text)) return "us";
  if (/(abc australia|guardian australia)/.test(text)) return "australia";
  if (/(bbc|financial times|ft global|guardian|economist|telegraph|independent|reuters)/.test(text)) return "uk";
  if (/(dw|spiegel|tagesschau)/.test(text)) return "germany";
  if (/(france24|rfi)/.test(text)) return "france";
  if (/(al jazeera)/.test(text)) return "qatar";
  if (/(japan times|nhk)/.test(text)) return "japan";
  if (/(yonhap|korea times)/.test(text)) return "south_korea";
  if (/(taipei times|rti taiwan|liberty times|udn)/.test(text)) return "taiwan";
  if (/(36kr|china news)/.test(text)) return "china";
  if (/(hkfp|rthk)/.test(text)) return "hong_kong";
  if (/(cna singapore)/.test(text)) return "singapore";
  if (/(star malaysia|malay mail)/.test(text)) return "malaysia";
  if (/(africanews|allafrica)/.test(text)) return "africa";
  if (/(nzz|le news switzerland)/.test(text)) return "switzerland";
  if (/(lux times|luxemburger wort)/.test(text)) return "luxembourg";
  return "global";
}

function countryLabel(country: string, lang: Lang): string {
  const labels: Record<string, { zh: string; en: string }> = {
    us: { zh: "美国", en: "United States" },
    uk: { zh: "英国", en: "United Kingdom" },
    germany: { zh: "德国", en: "Germany" },
    france: { zh: "法国", en: "France" },
    qatar: { zh: "卡塔尔", en: "Qatar" },
    japan: { zh: "日本", en: "Japan" },
    south_korea: { zh: "韩国", en: "South Korea" },
    taiwan: { zh: "台湾", en: "Taiwan" },
    china: { zh: "中国", en: "China" },
    hong_kong: { zh: "香港", en: "Hong Kong" },
    singapore: { zh: "新加坡", en: "Singapore" },
    malaysia: { zh: "马来西亚", en: "Malaysia" },
    australia: { zh: "澳大利亚", en: "Australia" },
    africa: { zh: "非洲", en: "Africa" },
    switzerland: { zh: "瑞士", en: "Switzerland" },
    luxembourg: { zh: "卢森堡", en: "Luxembourg" },
    global: { zh: "全球", en: "Global" },
  };
  const hit = labels[country] || labels.global;
  return lang === "zh" ? hit.zh : hit.en;
}

function normalizeSelectedIds(ids: number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  ids.forEach((id) => {
    if (!Number.isFinite(id) || id <= 0) return;
    const v = Math.trunc(id);
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  });
  return out;
}

function inferSelectOp(instruction: string): SelectOp {
  const text = instruction.trim().toLowerCase();
  if (!text) return "replace";
  if (/^(\+|追加|继续勾选|再勾选|add|append|mehr|hinzuf)/i.test(text)) return "append";
  if (/^(\-|取消勾选|移除|排除|remove|exclude|entfernen|aussch)/i.test(text)) return "remove";
  if (/^(精简|收窄|只保留|保留|refine|narrow|keep only|verfeinern|eingrenzen)/i.test(text)) return "refine";
  return "replace";
}

function mergeSelectedIds(current: number[], incoming: number[], op: SelectOp): number[] {
  const base = normalizeSelectedIds(current);
  const next = normalizeSelectedIds(incoming);
  if (op === "append") {
    return normalizeSelectedIds([...base, ...next]);
  }
  if (op === "remove") {
    const rm = new Set(next);
    return base.filter((id) => !rm.has(id));
  }
  if (op === "refine") {
    const keep = new Set(next);
    return base.filter((id) => keep.has(id));
  }
  return next;
}

export function App() {
  const [lang, setLang] = useState<Lang>("zh");
  const [sources, setSources] = useState<Source[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [q, setQ] = useState("");
  const [sourceId, setSourceId] = useState<number | "">("");
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [sourceCanScrollLeft, setSourceCanScrollLeft] = useState(false);
  const [sourceCanScrollRight, setSourceCanScrollRight] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [autoCollecting, setAutoCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  const [collectResult, setCollectResult] = useState<CollectResult | null>(null);
  const [collectStatus, setCollectStatus] = useState<CollectStatus | null>(null);
  const [booting, setBooting] = useState(true);
  const [now, setNow] = useState<Date>(new Date());
  const [totalCount, setTotalCount] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState<RegionKey>("all");
  const [regionCounts, setRegionCounts] = useState<RegionCounts>({
    north_america: 0,
    europe: 0,
    middle_east: 0,
    australia: 0,
    africa: 0,
    neutral_zone: 0,
    east_asia: 0,
    greater_china: 0,
    se_asia: 0,
    other: 0,
    all: 0
  });
  const [chatMode, setChatMode] = useState<"filtered" | "all" | "selected">("filtered");
  const [useNewsContext, setUseNewsContext] = useState(true);
  const [chatLimit, setChatLimit] = useState(16);
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingUserPrompt, setPendingUserPrompt] = useState<string | null>(null);
  const [selectingNewsLoading, setSelectingNewsLoading] = useState(false);
  const [refiningLoading, setRefiningLoading] = useState(false);
  const [autoSelectPrompt, setAutoSelectPrompt] = useState("");
  const [chatInputHeight, setChatInputHeight] = useState(180);
  const [selectedNewsIds, setSelectedNewsIds] = useState<number[]>([]);
  const [selectedHydrated, setSelectedHydrated] = useState(false);
  const [selectedOnlyNews, setSelectedOnlyNews] = useState<News[]>([]);
  const [selectedNewsMeta, setSelectedNewsMeta] = useState<Record<number, { title: string; source: string; url: string; published_at?: string | null }>>({});
  const [showSelectedList, setShowSelectedList] = useState(false);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [llmModels, setLlmModels] = useState<LlmModelsOut | null>(null);
  const [llmModelDraft, setLlmModelDraft] = useState("");
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [marketChecking, setMarketChecking] = useState(false);
  const [marketRefreshNotice, setMarketRefreshNotice] = useState<string | null>(null);
  const [marketHistory, setMarketHistory] = useState<Record<string, MarketHistoryPoint[]>>({});
  const [marketModalKey, setMarketModalKey] = useState<string | null>(null);
  const [marketRange, setMarketRange] = useState<MarketRange>("1h");
  const [metalUnitMode, setMetalUnitMode] = useState<"usd_imperial" | "eur_metric">("usd_imperial");
  const [translateInput, setTranslateInput] = useState("");
  const [translateTarget, setTranslateTarget] = useState<"zh" | "en" | "de" | "ja" | "ko" | "ar" | "fr" | "es">("en");
  const [translateSource, setTranslateSource] = useState<"auto" | "zh" | "en" | "de" | "ja" | "ko" | "ar" | "fr" | "es">("auto");
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateOutput, setTranslateOutput] = useState("");
  const [translateMeta, setTranslateMeta] = useState<{ source: string; target: string; provider: string } | null>(null);
  const [llmDrawerOpen, setLlmDrawerOpen] = useState(false);
  const [isChatAtBottom, setIsChatAtBottom] = useState(true);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [activeTab, setActiveTab] = useState<PageTab>("dashboard");
  const [owidCards, setOwidCards] = useState<OwidModuleCard[]>([]);
  const [owidLoading, setOwidLoading] = useState(false);
  const [owidError, setOwidError] = useState<string | null>(null);
  const [owidTitleTranslations, setOwidTitleTranslations] = useState<Record<string, string>>({});
  const [newsRefreshNotice, setNewsRefreshNotice] = useState<string | null>(null);
  const [refreshStats, setRefreshStats] = useState<RefreshStat[]>([]);
  const lastCollectRunningRef = useRef(false);
  const collectStatusHydratedRef = useRef(false);
  const postBootInitRef = useRef(false);
  const chatLoadingRef = useRef(false);
  const llmPanelRef = useRef<HTMLElement | null>(null);
  const sourceMenuRef = useRef<HTMLDivElement | null>(null);
  const sourceMenuColumnsRef = useRef<HTMLDivElement | null>(null);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const newsColumnRef = useRef<HTMLDivElement | null>(null);
  const [isPageAtTop, setIsPageAtTop] = useState(true);
  const showStartupOverlay = booting;

  const sourceMap = useMemo(() => {
    const m = new Map<number, string>();
    sources.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [sources]);

  const selectedSourceName = useMemo(() => {
    if (sourceId === "") return "";
    return sources.find((s) => s.id === sourceId)?.name || "";
  }, [sources, sourceId]);

  const sourceMenuColumns = useMemo(() => {
    const regionOrder: RegionBucketKey[] = [
      "north_america",
      "europe",
      "middle_east",
      "africa",
      "australia",
      "east_asia",
      "greater_china",
      "se_asia",
      "neutral_zone",
    ];

    const columns = regionOrder
      .map((region) => {
        const regionSources = sources.filter((s) => inferRegionFromSourceName(s.name) === region);
        if (!regionSources.length) return null;

        const countryMap = new Map<string, Source[]>();
        regionSources.forEach((s) => {
          const country = inferCountryFromSourceName(s.name);
          const rows = countryMap.get(country) || [];
          rows.push(s);
          countryMap.set(country, rows);
        });

        const countries = Array.from(countryMap.entries())
          .sort((a, b) => countryLabel(a[0], lang).localeCompare(countryLabel(b[0], lang)))
          .map(([country, rows]) => ({
            country,
            label: countryLabel(country, lang),
            sources: rows.sort((a, b) => a.name.localeCompare(b.name)),
          }));

        const normalizedCountries =
          region === "se_asia"
            ? [
                {
                  country: "se_asia",
                  label: regionLabel("se_asia", lang),
                  sources: countries.flatMap((x) => x.sources).sort((a, b) => a.name.localeCompare(b.name)),
                },
              ]
            : countries;

        return {
          region,
          label: regionLabel(region as RegionKey, lang),
          countries: normalizedCountries,
        };
      })
      .filter((x): x is { region: RegionBucketKey; label: string; countries: Array<{ country: string; label: string; sources: Source[] }> } => Boolean(x));

    return columns;
  }, [sources, lang]);

  const visibleNews = useMemo(() => {
    if (!showSelectedOnly) return news;
    return selectedOnlyNews;
  }, [news, showSelectedOnly, selectedOnlyNews]);

  useEffect(() => {
    if (showSelectedOnly && selectedNewsIds.length === 0) {
      setShowSelectedOnly(false);
      setSelectedOnlyNews([]);
    }
  }, [showSelectedOnly, selectedNewsIds.length]);

  useEffect(() => {
    if (!sourceMenuOpen) return;
    const onMouseDown = (evt: MouseEvent) => {
      if (!sourceMenuRef.current) return;
      const target = evt.target as Node | null;
      if (target && !sourceMenuRef.current.contains(target)) {
        setSourceMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [sourceMenuOpen]);

  const updateSourceMenuScrollState = useCallback(() => {
    const cols = sourceMenuColumnsRef.current;
    if (!cols) {
      setSourceCanScrollLeft(false);
      setSourceCanScrollRight(false);
      return;
    }
    const maxLeft = Math.max(0, cols.scrollWidth - cols.clientWidth);
    setSourceCanScrollLeft(cols.scrollLeft > 4);
    setSourceCanScrollRight(cols.scrollLeft < maxLeft - 4);
  }, []);

  useEffect(() => {
    if (!sourceMenuOpen) return;
    updateSourceMenuScrollState();
    window.addEventListener("resize", updateSourceMenuScrollState);
    return () => window.removeEventListener("resize", updateSourceMenuScrollState);
  }, [sourceMenuOpen, sourceMenuColumns.length, updateSourceMenuScrollState]);

  const scrollSourceColumns = useCallback((direction: "left" | "right") => {
    const cols = sourceMenuColumnsRef.current;
    if (!cols) return;
    const firstCol = cols.querySelector<HTMLElement>(".source-col");
    const step = (firstCol?.offsetWidth || 220) + 10;
    const delta = direction === "left" ? -step : step;
    cols.scrollBy({ left: delta, behavior: "smooth" });
    window.setTimeout(updateSourceMenuScrollState, 220);
  }, [updateSourceMenuScrollState]);

  useEffect(() => {
    if (!showSelectedOnly) return;
    if (selectedNewsIds.length === 0) {
      setSelectedOnlyNews([]);
      return;
    }

    const chunkSize = 100;
    void (async () => {
      try {
        const chunks: number[][] = [];
        for (let i = 0; i < selectedNewsIds.length; i += chunkSize) {
          chunks.push(selectedNewsIds.slice(i, i + chunkSize));
        }
        const groups = await Promise.all(chunks.map((ids) => api.getNewsByIds(ids)));
        const map = new Map<number, News>();
        groups.flat().forEach((row) => map.set(row.id, row));
        const ordered = selectedNewsIds
          .map((id) => map.get(id))
          .filter((row): row is News => Boolean(row));
        setSelectedOnlyNews(ordered);
      } catch {
        setSelectedOnlyNews([]);
      }
    })();
  }, [showSelectedOnly, selectedNewsIds]);

  const selectedNewsPreview = useMemo(
    () =>
      selectedNewsIds.map((id) => {
        const item = news.find((n) => n.id === id);
        const meta = selectedNewsMeta[id];
        return {
          id,
          title: item?.title || meta?.title || "(当前筛选未加载该新闻标题)",
          source: item?.source_name || meta?.source || "未知来源",
          url: item?.url || meta?.url || "",
          published_at: item?.published_at || meta?.published_at || null
        };
      }),
    [selectedNewsIds, selectedNewsMeta, news]
  );

  const selectedNewsIdSet = useMemo(() => new Set(selectedNewsIds), [selectedNewsIds]);

  const renderedChatHistory = useMemo(() => {
    const maxRender = 120;
    if (chatHistory.length <= maxRender) return chatHistory;
    return chatHistory.slice(-maxRender);
  }, [chatHistory]);

  useEffect(() => {
    void bootstrap();
    const saved = window.localStorage.getItem("ui_lang");
    if (saved === "zh" || saved === "en" || saved === "de") {
      setLang(saved);
    }
    try {
      const raw = window.localStorage.getItem("selected_news_ids");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSelectedNewsIds(normalizeSelectedIds(parsed.map((x) => Number(x))));
        }
      }
    } catch {
      // ignore local parse issues
    } finally {
      setSelectedHydrated(true);
    }

    try {
      const rawStats = window.localStorage.getItem("news_refresh_stats");
      if (rawStats) {
        const parsed = JSON.parse(rawStats);
        if (Array.isArray(parsed)) {
          setRefreshStats(parsed.slice(0, 500));
        }
      }
    } catch {
      // ignore local parse issues
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ui_lang", lang);
  }, [lang]);

  useEffect(() => {
    if (!selectedHydrated) return;
    window.localStorage.setItem("selected_news_ids", JSON.stringify(normalizeSelectedIds(selectedNewsIds)));
  }, [selectedNewsIds, selectedHydrated]);

  useEffect(() => {
    window.localStorage.setItem("news_refresh_stats", JSON.stringify(refreshStats.slice(0, 500)));
  }, [refreshStats]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!newsRefreshNotice) return;
    const timer = window.setTimeout(() => setNewsRefreshNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [newsRefreshNotice]);

  useEffect(() => {
    if (!marketRefreshNotice) return;
    const timer = window.setTimeout(() => setMarketRefreshNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [marketRefreshNotice]);

  useEffect(() => {
    chatLoadingRef.current = chatLoading;
  }, [chatLoading]);

  useEffect(() => {
    if (lang === "en") return;
    if (owidCards.length === 0) return;

    const target = lang === "zh" ? "zh" : "de";
    const missing = owidCards.filter((card) => !owidTitleTranslations[`${target}|${card.indicator}|${card.entity}`]);
    if (missing.length === 0) return;

    let cancelled = false;
    void (async () => {
      for (const card of missing) {
        if (cancelled) return;
        const key = `${target}|${card.indicator}|${card.entity}`;
        try {
          const res = await api.translateText({ text: card.title, source_lang: "en", target_lang: target });
          if (cancelled) return;
          setOwidTitleTranslations((prev) => ({ ...prev, [key]: res.translated_text || card.title }));
        } catch {
          if (cancelled) return;
          setOwidTitleTranslations((prev) => ({ ...prev, [key]: card.title }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lang, owidCards, owidTitleTranslations]);

  useEffect(() => {
    if (booting || postBootInitRef.current) return;
    postBootInitRef.current = true;

    let marketTimer = 0;
    const delayed = window.setTimeout(() => {
      void loadLlmModels();
      void loadChatMemory();
      void refreshMarketPanel();
      void refreshOwidModules();
      void refreshCollectStatus();

      marketTimer = window.setInterval(() => {
        if (!document.hidden) {
          void refreshMarketPanel();
        }
      }, 60000);
    }, 180);

    return () => {
      window.clearTimeout(delayed);
      if (marketTimer) window.clearInterval(marketTimer);
    };
  }, [booting]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void runAutoCollectTick();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [booting, autoCollecting, q, sourceId, selectedRegion, news.length]);

  useEffect(() => {
    if (booting) return;
    const intervalMs = collectStatus?.running ? 900 : 5000;
    const timer = window.setInterval(() => {
      if (!document.hidden || collectStatus?.running) {
        void refreshCollectStatus();
      }
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [booting, collectStatus?.running]);

  useEffect(() => {
    if (sources.length === 0) return;
    void onSearch();
  }, [selectedRegion]);

  async function bootstrap() {
    let bootstrapError = "";
    try {
      setError(null);
      let srcs: Source[] = [];

      try {
        srcs = await api.getSources();
      } catch (e) {
        bootstrapError = (e as Error).message;
      }

      if (srcs.length === 0) {
        try {
          const seed = await api.seedSources();
          setSeedResult(seed);
          srcs = await api.getSources();
        } catch (e) {
          bootstrapError = bootstrapError || (e as Error).message;
        }
      }

      setSources(srcs);

      try {
        const region = selectedRegion === "all" ? undefined : selectedRegion;
        const rows = await api.getNews({
          q: q || undefined,
          source_id: sourceId === "" ? undefined : sourceId,
          region,
          limit: 120,
        });
        setNews(rows);
        setTotalCount(rows.length);
      } catch (e) {
        bootstrapError = bootstrapError || (e as Error).message;
      }

      setBooting(false);

      void (async () => {
        try {
          const region = selectedRegion === "all" ? undefined : selectedRegion;
          const [count, mapCounts] = await Promise.all([
            api.getNewsCount({ q: q || undefined, source_id: sourceId === "" ? undefined : sourceId, region }),
            api.getRegionCounts(),
          ]);
          setTotalCount(count.total);
          setRegionCounts(mapCounts);
        } catch {
          // keep current values when meta refresh fails
        }
      })();

      void refreshCollectStatus();

      if (bootstrapError) {
        setError(bootstrapError);
      }
    } catch (e) {
      setError((e as Error).message);
      setBooting(false);
    }
  }

  async function refreshNewsView() {
    const region = selectedRegion === "all" ? undefined : selectedRegion;
    const [rows, count, mapCounts] = await Promise.all([
      api.getNews({
        q: q || undefined,
        source_id: sourceId === "" ? undefined : sourceId,
        region,
        limit: 200
      }),
      api.getNewsCount({ q: q || undefined, source_id: sourceId === "" ? undefined : sourceId, region }),
      api.getRegionCounts()
    ]);
    setNews(rows);
    setTotalCount(count.total);
    setRegionCounts(mapCounts);
  }

  async function refreshNewsIncremental() {
    const region = selectedRegion === "all" ? undefined : selectedRegion;
    const maxId = news.length > 0 ? Math.max(...news.map((n) => n.id)) : undefined;
    if (!maxId) {
      return { added: 0, byRegion: { north_america: 0, europe: 0, middle_east: 0, australia: 0, africa: 0, neutral_zone: 0, east_asia: 0, greater_china: 0, se_asia: 0, other: 0 } as Record<RegionBucketKey, number> };
    }

    const rows = await api.getNews({
      q: q || undefined,
      source_id: sourceId === "" ? undefined : sourceId,
      region,
      after_id: maxId,
      limit: 200
    });

    if (!rows.length) {
      return { added: 0, byRegion: { north_america: 0, europe: 0, middle_east: 0, australia: 0, africa: 0, neutral_zone: 0, east_asia: 0, greater_china: 0, se_asia: 0, other: 0 } as Record<RegionBucketKey, number> };
    }

    let added = 0;
    let addedRows: News[] = [];
    setNews((prev) => {
      const seen = new Set(prev.map((x) => x.id));
      const uniqueNew = rows.filter((x) => !seen.has(x.id));
      added = uniqueNew.length;
      addedRows = uniqueNew;
      const merged = [...uniqueNew, ...prev];
      return merged.slice(0, 260);
    });
    if (added > 0) {
      setTotalCount((prev) => prev + added);
    }
    try {
      const mapCounts = await api.getRegionCounts();
      setRegionCounts(mapCounts);
    } catch {
      // ignore
    }
    const byRegion = { north_america: 0, europe: 0, middle_east: 0, australia: 0, africa: 0, neutral_zone: 0, east_asia: 0, greater_china: 0, se_asia: 0, other: 0 } as Record<RegionBucketKey, number>;
    addedRows.forEach((row) => {
      byRegion[inferRegionFromSourceName(row.source_name)] += 1;
    });
    return { added, byRegion };
  }

  function recordRefreshStat(trigger: RefreshStat["trigger"], added: number, byRegion?: Record<RegionBucketKey, number>) {
    const row: RefreshStat = {
      ts: new Date().toISOString(),
      trigger,
      added: Math.max(0, added),
      visible: Math.max(0, news.length + Math.max(0, added)),
      total: Math.max(0, totalCount + Math.max(0, added)),
      q,
      source_id: sourceId === "" ? null : sourceId,
      region: selectedRegion,
      selected_count: selectedNewsIds.length,
      fetched_count: collectResult?.fetched_count ?? null,
      inserted_count: collectResult?.inserted_count ?? null,
      duplicate_count: collectResult?.duplicate_count ?? null,
      source_done: collectStatus?.source_done ?? null,
      source_total: collectStatus?.source_total ?? null,
      current_source: collectStatus?.current_source ?? null,
      added_by_region: byRegion || { north_america: 0, europe: 0, middle_east: 0, australia: 0, africa: 0, neutral_zone: 0, east_asia: 0, greater_china: 0, se_asia: 0, other: 0 },
    };
    setRefreshStats((prev) => [row, ...prev].slice(0, 500));
  }

  async function checkNewsUpdatesNow(showNoNewNotice = true, trigger: RefreshStat["trigger"] = "manual") {
    if (checkingUpdates || loading || chatLoading || selectingNewsLoading || refiningLoading) return;
    setCheckingUpdates(true);
    try {
      const result = await refreshNewsIncremental();
      const added = result.added;
      recordRefreshStat(trigger, added, result.byRegion);
      if (added > 0) {
        setNewsRefreshNotice(tr(`已更新 ${added} 条新内容`, `${added} new items added`, `${added} neue Eintraege hinzugefuegt`));
      } else if (showNoNewNotice) {
        setNewsRefreshNotice(tr("暂无新内容", "No new items", "Keine neuen Eintraege"));
      }
    } catch {
      // keep quiet for manual lightweight refresh
    } finally {
      setCheckingUpdates(false);
    }
  }

  async function runAutoCollectTick() {
    if (document.hidden) return;
    if (booting || autoCollecting || loading) return;
    setAutoCollecting(true);
    try {
      const collect = await api.collectNews();
      setCollectResult(collect);
      const result = await refreshNewsIncremental();
      const added = result.added;
      recordRefreshStat("collect", added, result.byRegion);
      if (added > 0) {
        setNewsRefreshNotice(tr(`自动抓取新增 ${added} 条`, `Auto-collect added ${added} new items`, `Auto-Erfassung: ${added} neue Eintraege`));
      }
    } catch {
      // keep quiet for background auto-collect failures
    } finally {
      setAutoCollecting(false);
    }
  }

  async function refreshCollectStatus() {
    try {
      const status = await api.getCollectStatus();
      setCollectStatus((prev) => {
        if (
          prev &&
          prev.running === status.running &&
          prev.source_total === status.source_total &&
          prev.source_done === status.source_done &&
          prev.current_source === status.current_source
        ) {
          return prev;
        }
        return status;
      });
      if (!status.running && status.last_result) {
        setCollectResult(status.last_result);
      }
      if (!collectStatusHydratedRef.current) {
        collectStatusHydratedRef.current = true;
        lastCollectRunningRef.current = status.running;
        return;
      }

      if (lastCollectRunningRef.current && !status.running) {
        const result = await refreshNewsIncremental();
        const added = result.added;
        recordRefreshStat("collect", added, result.byRegion);
        setNewsRefreshNotice(
          added > 0
            ? tr(`抓取完成，新增 ${added} 条`, `Collection finished: ${added} new items`, `Erfassung fertig: ${added} neue Eintraege`)
            : tr("抓取完成，无新增内容", "Collection finished: no new items", "Erfassung fertig: keine neuen Eintraege")
        );
      }
      lastCollectRunningRef.current = status.running;
    } catch {
      // keep silent for status polling
    }
  }

  async function loadLlmModels() {
    try {
      const data = await api.getLlmModels();
      setLlmModels(data);
      setLlmModelDraft(data.current_model || "");
    } catch {
      // ignore
    }
  }

  async function loadChatMemory() {
    try {
      const data = await api.getLlmMemory();
      const mapped = data.items
        .filter((x) => x.role === "user" || x.role === "assistant")
        .map((x) => ({ role: x.role as "user" | "assistant", text: x.text }));
      setChatHistory(mapped);
    } catch {
      // ignore
    }
  }

  async function clearChatMemory() {
    try {
      await api.clearLlmMemory();
      setChatHistory([]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshMarketPanel(showNotice = false) {
    if (showNotice) setMarketChecking(true);
    try {
      const snapshot = await api.getMarketSnapshot(showNotice);
      let changed = false;
      if (!market || market.items.length !== snapshot.items.length) {
        changed = true;
      } else {
        const prevByKey = new Map(market.items.map((x) => [x.key, x]));
        for (const item of snapshot.items) {
          const prev = prevByKey.get(item.key);
          if (!prev || prev.price !== item.price || prev.change_pct !== item.change_pct || prev.updated_at !== item.updated_at) {
            changed = true;
            break;
          }
        }
      }
      setMarket(snapshot);
      const observedAt = new Date().toISOString();
      setMarketHistory((prev) => {
        const next: Record<string, MarketHistoryPoint[]> = { ...prev };
        snapshot.items.forEach((item) => {
          if (item.price === null || Number.isNaN(item.price)) return;
          const current = next[item.key] ? [...next[item.key]] : [];
          const last = current[current.length - 1];
          if (!last || last.price !== item.price) {
            current.push({ ts: observedAt, price: item.price });
          } else {
            current[current.length - 1] = { ts: observedAt, price: item.price };
          }
          next[item.key] = current.slice(-720);
        });
        return next;
      });
      if (showNotice) {
        setMarketRefreshNotice(
          changed
            ? tr("行情已更新", "Quotes updated", "Kurse aktualisiert")
            : tr("行情无变化", "No quote changes", "Keine Kursaenderung")
        );
      }
    } catch {
      // ignore transient market fetch failures
    } finally {
      if (showNotice) setMarketChecking(false);
    }
  }

  async function refreshOwidModules() {
    setOwidLoading(true);
    try {
      setOwidError(null);
      const cards = await api.getOwidRandomModules(10, 40);
      setOwidCards(cards);
    } catch (e) {
      setOwidError((e as Error).message);
      setOwidCards([]);
    } finally {
      setOwidLoading(false);
    }
  }

  async function onSelectModel(model: string) {
    setLlmModelDraft(model);
    try {
      await api.selectLlmModel(model);
    } catch (e) {
      setError((e as Error).message);
      setLlmModelDraft(llmModels?.current_model || "");
    }
  }

  async function onTranslateText() {
    const text = translateInput.trim();
    if (!text) {
      setError(t("请先输入要翻译的文本", "Please enter text to translate first"));
      return;
    }
    setTranslateLoading(true);
    try {
      setError(null);
      const result = await api.translateText({ text, source_lang: translateSource, target_lang: translateTarget });
      setTranslateOutput(result.translated_text);
      setTranslateMeta({ source: result.source_lang, target: result.target_lang, provider: result.provider });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTranslateLoading(false);
    }
  }

  async function onSearch() {
    setLoading(true);
    try {
      setError(null);
      await refreshNewsView();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onCollect() {
    setLoading(true);
    void refreshCollectStatus();
    try {
      setError(null);
      const collect = await api.collectNews();
      setCollectResult(collect);
      await refreshNewsIncremental();
      await refreshCollectStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onChat() {
    if (chatLoading || selectingNewsLoading || refiningLoading) {
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          text: tr("正在处理中，请稍候再发送。", "A request is already running. Please wait.", "Eine Anfrage laeuft bereits. Bitte kurz warten.")
        }
      ]);
      return;
    }
    const raw = chatInputRef.current?.value || "";
    const prompt = raw.trim();
    if (!prompt) return;

    const inlineSelectInstruction = extractInlineSelectInstruction(prompt);

    if (chatInputRef.current) {
      chatInputRef.current.value = "";
    }

    if (inlineSelectInstruction) {
      setChatHistory((prev) => [...prev, { role: "user", text: prompt }]);
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", text: tr("正在按指令筛选并勾选新闻...", "Selecting and checking news by instruction...", "Nachrichten werden nach Anweisung gefiltert und markiert...") }
      ]);
      await onLlmAutoSelectNews(inlineSelectInstruction, false);
      return;
    }

    setChatLoading(true);
    setSelectingNewsLoading(false);
    setPendingUserPrompt(prompt);
    setChatHistory((prev) => [...prev, { role: "user", text: prompt }]);
    try {
      const region = chatMode === "all" || selectedRegion === "all" ? undefined : selectedRegion;
      const chatSourceId = chatMode === "all" ? undefined : (sourceId === "" ? undefined : sourceId);
      let finalSelectedIds = [...selectedNewsIds];

      if (useNewsContext) {
        setSelectingNewsLoading(true);
        const selectResult: LlmSelectNewsOut = await api.llmSelectNews({
          instruction: prompt,
          mode: chatMode,
          q: chatMode === "filtered" ? (q || undefined) : undefined,
          source_id: chatSourceId,
          region,
          news_ids: selectedNewsIds,
          limit: chatMode === "all" ? 500 : 300
        });

        finalSelectedIds = normalizeSelectedIds(selectResult.selected_ids).slice(0, Math.max(1, chatLimit));
        setSelectedNewsIds(finalSelectedIds);
        if (selectResult.selected_items.length > 0) {
          setSelectedNewsMeta((prev) => {
            const next = { ...prev };
            selectResult.selected_items.forEach((item) => {
              next[item.id] = { title: item.title, source: item.source, url: item.url, published_at: item.published_at };
            });
            return next;
          });
        }
        setShowSelectedList(true);
        setShowSelectedOnly(false);
        setSelectingNewsLoading(false);

        if (finalSelectedIds.length === 0) {
          setChatHistory((prev) => [
            ...prev,
            {
              role: "assistant",
              text: t(
                `未从当前范围中筛选到匹配新闻（扫描 ${selectResult.scanned_news_count} 条）。请尝试放宽范围或调整问题关键词。`,
                `No matching news selected in current scope (scanned ${selectResult.scanned_news_count}). Try broader scope or adjust keywords.`
              )
            }
          ]);
          return;
        }
      }

      const result: LlmChatOut = await api.llmChat({
        message: prompt,
        mode: useNewsContext ? "selected" : chatMode,
        use_news_context: useNewsContext,
        ui_lang: lang,
        use_chat_history: true,
        history_turns: 12,
        q: useNewsContext ? undefined : (chatMode === "filtered" ? (q || undefined) : undefined),
        source_id: useNewsContext ? undefined : chatSourceId,
        region: useNewsContext ? undefined : region,
        news_ids: useNewsContext ? finalSelectedIds : selectedNewsIds,
        limit: chatLimit
      });

      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `${result.answer}\n\n${useNewsContext ? t(`本次分析新闻ID: ${formatNewsIdList(finalSelectedIds)}`, `News IDs used: ${formatNewsIdList(finalSelectedIds)}`) : t("本次分析未使用新闻上下文", "No news context used for this answer")}\n[provider=${result.provider}, model=${result.model}, news=${result.used_news_count}]`
        }
      ]);
    } catch (e) {
      const msg = (e as Error).message || "unknown";
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", text: `请求失败: ${msg}\n建议先切到“快速(8条)”或减少勾选新闻数量后重试。` }
      ]);
    } finally {
      setSelectingNewsLoading(false);
      setPendingUserPrompt(null);
      setChatLoading(false);
    }
  }

  function extractInlineSelectInstruction(prompt: string): string | null {
    const text = prompt.trim();
    if (!text) return null;

    const slash = text.match(/^\/(select|autoselect|selectall|勾选)\s+(.+)$/i);
    if (slash?.[2]) return slash[2].trim();

    const prefixed = text.match(/^(勾选|请勾选|帮我勾选|筛选并勾选|select|auto\s*select)\s*[：:]?\s*(.+)$/i);
    if (prefixed?.[2]) return prefixed[2].trim();

    if (/(勾选|筛选并勾选|取消勾选|精简|只保留|auto\s*select|select|append|remove|refine)/i.test(text)) {
      return text;
    }

    return null;
  }

  async function onLlmAutoSelectNews(instructionOverride?: string, forceGlobalScope = false) {
    if (selectingNewsLoading || chatLoading) return;
    const instruction = (instructionOverride ?? autoSelectPrompt).trim();
    if (!instruction) {
      setError(t("请先在自动勾选输入框中写明筛选要求，再点“按条件自动勾选”。", "Please enter selection instruction in auto-select input, then click Auto Select by Prompt."));
      return;
    }

    setSelectingNewsLoading(true);
    try {
      setError(null);
      const op = inferSelectOp(instruction);
      const currentSelected = [...selectedNewsIds];
      const region = forceGlobalScope ? undefined : (chatMode === "all" || selectedRegion === "all" ? undefined : selectedRegion);
      const chatSourceId = forceGlobalScope ? undefined : (chatMode === "all" ? undefined : (sourceId === "" ? undefined : sourceId));
      const selectMode = forceGlobalScope ? "all" : (op === "append" && chatMode === "selected" ? "filtered" : chatMode);
      const result: LlmSelectNewsOut = await api.llmSelectNews({
        instruction,
        mode: selectMode,
        q: forceGlobalScope ? undefined : (chatMode === "filtered" ? (q || undefined) : undefined),
        source_id: chatSourceId,
        region,
        news_ids: forceGlobalScope ? [] : selectedNewsIds,
        limit: forceGlobalScope ? 0 : 500
      });

      const mergedSelected = mergeSelectedIds(currentSelected, result.selected_ids, op);
      setSelectedNewsIds(mergedSelected);
      if (mergedSelected.length > 0) {
        setChatMode("selected");
      }
      if (result.selected_items.length > 0) {
        setSelectedNewsMeta((prev) => {
          const next = { ...prev };
          result.selected_items.forEach((item) => {
            next[item.id] = { title: item.title, source: item.source, url: item.url, published_at: item.published_at };
          });
          return next;
        });
      }
      setShowSelectedList(true);
      setShowSelectedOnly(false);
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          text: t(
            `已完成勾选更新（模式: ${op}）：候选 ${result.selected_ids.length} 条，当前选集 ${mergedSelected.length} 条（扫描 ${result.scanned_news_count} 条）。\n[provider=${result.provider}, model=${result.model}]\n${result.reason || ""}`,
            `Selection updated (mode: ${op}): candidate ${result.selected_ids.length}, current set ${mergedSelected.length} (scanned ${result.scanned_news_count}).\n[provider=${result.provider}, model=${result.model}]\n${result.reason || ""}`
          )
        }
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSelectingNewsLoading(false);
    }
  }

  function getLastUserMessage(): string {
    for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
      if (chatHistory[i].role === "user") return chatHistory[i].text;
    }
    return "";
  }

  function getLastAssistantMessage(): string {
    for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
      if (chatHistory[i].role === "assistant") return chatHistory[i].text;
    }
    return "";
  }

  async function onRefineAndRerun() {
    if (chatLoading || selectingNewsLoading || refiningLoading) return;
    const lastUser = getLastUserMessage().trim();
    const lastAssistant = getLastAssistantMessage().trim();
    const currentInput = (chatInputRef.current?.value || "").trim();
    const messageForRerun = currentInput || lastUser;
    if (!lastUser || !lastAssistant) {
      setError(t("需要先有一轮问答后才能执行补充检索。", "Need at least one completed Q&A before refinement."));
      return;
    }

    const confirmed = window.confirm(
      t(
        "检测到可能需要补充信息。是否让系统自动去重、补充关键词搜索、重选新闻并重新分析？",
        "Potential missing information detected. Let system dedupe, search by derived keywords, reselect news, and rerun analysis?"
      )
    );
    if (!confirmed) return;

    setRefiningLoading(true);
    try {
      setError(null);
      const region = chatMode === "all" || selectedRegion === "all" ? undefined : selectedRegion;
      const chatSourceId = chatMode === "all" ? undefined : (sourceId === "" ? undefined : sourceId);
      const result: LlmRefineRerunOut = await api.llmRefineRerun({
        message: messageForRerun,
        previous_answer: lastAssistant,
        mode: chatMode,
        use_news_context: true,
        ui_lang: lang,
        use_chat_history: true,
        history_turns: 12,
        q: chatMode === "filtered" ? (q || undefined) : undefined,
        source_id: chatSourceId,
        region,
        news_ids: selectedNewsIds,
        limit: chatLimit
      });

      setSelectedNewsIds(normalizeSelectedIds(result.selected_ids));
      if (result.selected_items.length > 0) {
        setSelectedNewsMeta((prev) => {
          const next = { ...prev };
          result.selected_items.forEach((item) => {
            next[item.id] = { title: item.title, source: item.source, url: item.url, published_at: item.published_at };
          });
          return next;
        });
      }
      setShowSelectedList(true);
      setChatMode("selected");
      if (result.selected_ids.length > 0) {
        try {
          const selectedRows = await api.getNewsByIds(result.selected_ids.slice(0, 160));
          setNews((prev) => {
            const map = new Map<number, News>();
            selectedRows.forEach((row) => map.set(row.id, row));
            prev.forEach((row) => {
              if (!map.has(row.id)) map.set(row.id, row);
            });
            return Array.from(map.values());
          });
        } catch {
          // ignore and keep current list
        }
      }
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          text: t(
            `已执行补充检索并重分析：新增 ${result.added_ids.length} 条，当前勾选 ${result.selected_ids.length} 条。\n补充关键词：${result.keywords.join(" / ") || "-"}\n${result.missing_points.length ? `待补充信息：${result.missing_points.join("；")}` : ""}\n\n${result.answer}\n\n本次分析新闻ID: ${formatNewsIdList(result.selected_ids.slice(0, chatLimit))}\n[provider=${result.provider}, model=${result.model}, news=${result.used_news_count}]`,
            `Refinement rerun complete: added ${result.added_ids.length}, selected ${result.selected_ids.length}.\nKeywords: ${result.keywords.join(" / ") || "-"}\n${result.missing_points.length ? `Missing points: ${result.missing_points.join("; ")}` : ""}\n\n${result.answer}\n\nNews IDs used: ${formatNewsIdList(result.selected_ids.slice(0, chatLimit))}\n[provider=${result.provider}, model=${result.model}, news=${result.used_news_count}]`
          )
        }
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefiningLoading(false);
    }
  }

  const toggleSelectNews = useCallback((newsId: number) => {
    setSelectedNewsIds((prev) => (prev.includes(newsId) ? prev.filter((x) => x !== newsId) : [...prev, newsId]));
  }, []);

  const clearSelectedNews = useCallback(() => {
    setSelectedNewsIds([]);
    setShowSelectedOnly(false);
    setShowSelectedList(false);
    setSelectedOnlyNews([]);
  }, []);

  function onChatInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onChat();
    }
  }

  function startResizeChatInput(e: ReactMouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = chatInputHeight;

    const onMove = (ev: MouseEvent) => {
      const next = startHeight + (startY - ev.clientY);
      const clamped = Math.min(420, Math.max(100, next));
      setChatInputHeight(clamped);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function snapLlmPanelToViewport(e: ReactMouseEvent<HTMLElement>) {
    if (window.innerWidth <= 1200) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, input, select, textarea, a, label")) return;
    const panel = llmPanelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const targetTop = 12;
    const delta = rect.top - targetTop;
    if (Math.abs(delta) > 8) {
      window.scrollBy({ top: delta, behavior: "smooth" });
    }
  }

  function scrollNewsToTop() {
    const box = newsColumnRef.current;
    if (box) {
      box.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function formatTime(value: string | null) {
    const dt = toUtcDate(value);
    if (!dt) return "-";
    return dt.toLocaleString(undefined, formatOptions);
  }

  function formatSourceTime(value: string | null, sourceTimezone: string) {
    const dt = toUtcDate(value);
    if (!dt) return "-";
    return new Intl.DateTimeFormat(undefined, { ...formatOptions, timeZone: sourceTimezone || "UTC" }).format(dt);
  }

  function formatDataTimestamp(value: string | null) {
    const dt = toUtcDate(value);
    if (!dt) return "-";
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(dt);
  }

  function filterMarketSeriesByRange(points: MarketHistoryPoint[], range: MarketRange): MarketHistoryPoint[] {
    if (range === "all") return points;
    const nowMs = Date.now();
    const backMs =
      range === "15m" ? 15 * 60 * 1000 :
      range === "1h" ? 60 * 60 * 1000 :
      range === "6h" ? 6 * 60 * 60 * 1000 :
      24 * 60 * 60 * 1000;
    return points.filter((p) => {
      const ts = Date.parse(p.ts);
      return Number.isFinite(ts) && ts >= nowMs - backMs;
    });
  }

  function scrollChatToLatest() {
    const box = chatBoxRef.current;
    if (!box) return;
    box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }

  useEffect(() => {
    const box = chatBoxRef.current;
    if (!box) return;
    if (!isChatAtBottom) return;
    box.scrollTo({ top: box.scrollHeight, behavior: "auto" });
  }, [chatHistory.length, isChatAtBottom]);

  useEffect(() => {
    if (!chatLoading) return;
    const box = chatBoxRef.current;
    if (!box) return;
    box.scrollTo({ top: box.scrollHeight, behavior: "auto" });
  }, [chatLoading]);

  useEffect(() => {
    if (activeTab !== "dashboard") return;
    const box = chatBoxRef.current;
    if (!box) return;
    const onScroll = () => {
      const remain = box.scrollHeight - box.scrollTop - box.clientHeight;
      setIsChatAtBottom(remain <= 28);
    };
    onScroll();
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, [activeTab]);

  useEffect(() => {
    const onScroll = () => {
      setIsPageAtTop(window.scrollY <= 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function formatPrice(value: number | null, digits = 3) {
    if (value === null || Number.isNaN(value)) return "-";
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: digits });
  }

  function formatPct(value: number | null) {
    if (value === null || Number.isNaN(value)) return "-";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  }

  function formatNewsIdList(ids: number[]) {
    if (!ids.length) return "-";
    return ids.join(", ");
  }

  function getEurUsdRate(): number | null {
    const eurCny = market?.items.find((x) => x.key === "eur_cny")?.price ?? null;
    const usdCny = market?.items.find((x) => x.key === "usd_cny")?.price ?? null;
    if (!eurCny || !usdCny) return null;
    return eurCny / usdCny;
  }

  function displayMarketPrice(item: NonNullable<MarketSnapshot["items"]>[number]) {
    const price = item.price;
    if (price === null || Number.isNaN(price)) return { value: "-", unit: item.unit };

    if (metalUnitMode === "usd_imperial") {
      return { value: formatPrice(price), unit: item.unit };
    }

    const eurUsd = getEurUsdRate();
    if (!eurUsd) {
      return { value: formatPrice(price), unit: item.unit };
    }

    if (item.key === "gold_usd" || item.key === "silver_usd") {
      const eurPerGram = (price / eurUsd) / 31.1034768;
      return { value: formatPrice(eurPerGram, 4), unit: "EUR/g" };
    }

    if (item.key === "copper_usd") {
      const eurPerKg = (price / eurUsd) / 0.45359237;
      return { value: formatPrice(eurPerKg, 4), unit: "EUR/kg" };
    }

    return { value: formatPrice(price), unit: item.unit };
  }

  const collectProgressPercent =
    collectStatus && collectStatus.source_total > 0
      ? Math.min(100, Math.round((collectStatus.source_done / collectStatus.source_total) * 100))
      : 0;
  const newsMapBusy = checkingUpdates || loading;

  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const tr = (zh: string, en: string, de: string) => (lang === "zh" ? zh : lang === "de" ? de : en);
  const chatModeDisplay =
    chatMode === "filtered"
      ? t("当前筛选", "Current filters")
      : chatMode === "all"
        ? t("全库新闻", "All news")
        : t("勾选新闻", "Selected news");

  const newsCards = useMemo(
    () =>
      visibleNews.map((item) => (
        <article key={item.id} className="card">
          <div className="meta">
            <span>{sourceMap.get(item.source_id) || item.source_name}</span>
            <span className="meta-nowrap">{t("发布时间(本地)", "Published (Local)")} {formatTime(item.published_at)}</span>
          </div>
          <div className="meta">
            <label className="meta-nowrap">
              <input type="checkbox" checked={selectedNewsIdSet.has(item.id)} onChange={() => toggleSelectNews(item.id)} /> {t("选中用于LLM", "Select for LLM")}
            </label>
          </div>
          <div className="meta">
            <span className="meta-nowrap">{t("发布时间(来源地)", "Published (Source TZ)")} {formatSourceTime(item.published_at, item.source_timezone)}</span>
            <span className="meta-nowrap">{t("来源时区", "Source TZ")} {item.source_timezone}</span>
          </div>
          <div className="meta">
            <span className="meta-nowrap">{t("采集时间", "Collected")} {formatTime(item.collected_at)}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.content || t("(无正文)", "(No content)")}</p>
          <a className="news-url" href={item.url} target="_blank" rel="noreferrer" title={item.url}>
            {item.url}
          </a>
        </article>
      )),
    [visibleNews, sourceMap, selectedNewsIdSet, toggleSelectNews, lang]
  );

  const owidModules = useMemo(
    () =>
      owidCards.map((card, idx) => {
        const pts = card.points || [];
        const last = pts.length > 0 ? pts[pts.length - 1] : null;
        const prev = pts.length > 1 ? pts[pts.length - 2] : null;
        const first = pts.length > 0 ? pts[0] : null;
        const delta = last && prev ? last.value - prev.value : null;
        const recentPoints = pts.slice(-18);
        const recentValues = recentPoints.map((x) => x.value);
        const firstRecent = recentPoints[0] || null;
        const lastRecent = recentPoints[recentPoints.length - 1] || null;
        const owidPageUrl = card.page_url;
        const titleKey = `${lang === "zh" ? "zh" : "de"}|${card.indicator}|${card.entity}`;
        const localizedTitle = lang === "en" ? card.title : (owidTitleTranslations[titleKey] || card.title);
        return (
          <article key={`owid-${card.indicator}-${card.entity}-${idx}`} className="owid-card">
            <div className="owid-card-top">
              <h4>{localizedTitle}</h4>
              <span className="owid-chip">{card.entity}</span>
            </div>
            <div className="owid-main-value">
              {last ? last.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}
            </div>
            <div className="owid-chart-wrap">
              {recentPoints.length >= 2 ? (
                <Plot
                  data={[
                    {
                      x: recentPoints.map((p) => p.year),
                      y: recentValues,
                      type: "scatter",
                      mode: "lines+markers",
                      line: { color: "#2f7f6f", width: 2.4 },
                      marker: { color: "#2f7f6f", size: 4 },
                      hovertemplate: "%{x}: %{y}<extra></extra>",
                    },
                  ]}
                  layout={{
                    autosize: true,
                    height: 170,
                    margin: { l: 48, r: 12, t: 8, b: 36 },
                    paper_bgcolor: "rgba(0,0,0,0)",
                    plot_bgcolor: "rgba(255,255,255,0.55)",
                    xaxis: {
                      title: { text: tr("年份", "Year", "Jahr"), standoff: 4 },
                      tickfont: { size: 10 },
                      gridcolor: "rgba(116,136,160,0.18)",
                    },
                    yaxis: {
                      title: { text: card.unit || tr("数值", "Value", "Wert"), standoff: 4 },
                      tickfont: { size: 10 },
                      gridcolor: "rgba(116,136,160,0.18)",
                    },
                    showlegend: false,
                  }}
                  config={{ displayModeBar: false, responsive: true, staticPlot: false }}
                  style={{ width: "100%", height: "170px" }}
                  useResizeHandler
                />
              ) : (
                <div className="owid-empty-chart">{tr("数据不足，无法绘图", "Not enough points for chart", "Zu wenige Daten fuer Diagramm")}</div>
              )}
            </div>
            <div className="owid-meta-row">
              <span>{t("最近年份", "Latest year")}: {last?.year ?? "-"}</span>
              <span>
                {t("变化", "Delta")}: {delta === null ? "-" : `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`}
              </span>
            </div>
            <div className="owid-meta-row">
              <span>{tr("起始年份", "Start year", "Startjahr")}: {first?.year ?? "-"}</span>
              <span>{tr("样本点", "Points", "Datenpunkte")}: {pts.length}{firstRecent && lastRecent ? ` (${firstRecent.year}-${lastRecent.year})` : ""}</span>
            </div>
            <div className="owid-meta-row">
              <span>{t("单位", "Unit")}: {card.unit || "-"}</span>
              <span className="owid-links-inline">
                <a href={owidPageUrl} target="_blank" rel="noreferrer">{tr("图表页面", "Chart page", "Diagrammseite")}</a>
                <a href={card.source_url} target="_blank" rel="noreferrer">{tr("数据链接", "Data link", "Datenlink")}</a>
              </span>
            </div>
          </article>
        );
      }),
    [owidCards, lang]
  );

  const refreshStatsSummary = useMemo(() => {
    const totalChecks = refreshStats.length;
    const totalAdded = refreshStats.reduce((acc, x) => acc + x.added, 0);
    const withNew = refreshStats.filter((x) => x.added > 0).length;
    const avgPerCheck = totalChecks > 0 ? totalAdded / totalChecks : 0;
    const avgPerMinute = totalChecks > 0
      ? (() => {
          const first = Date.parse(refreshStats[totalChecks - 1].ts);
          const last = Date.parse(refreshStats[0].ts);
          const mins = Math.max(1, (last - first) / 60000);
          return totalAdded / mins;
        })()
      : 0;
    const maxAdded = refreshStats.reduce((acc, x) => Math.max(acc, x.added), 0);
    const triggerCount = {
      manual: refreshStats.filter((x) => x.trigger === "manual").length,
      auto: refreshStats.filter((x) => x.trigger === "auto").length,
      collect: refreshStats.filter((x) => x.trigger === "collect").length,
    };
    return { totalChecks, totalAdded, withNew, avgPerCheck, avgPerMinute, maxAdded, triggerCount };
  }, [refreshStats]);

  const refreshTrend = useMemo(() => {
    const points = [...refreshStats].slice(0, 80).reverse();
    return {
      x: points.map((p) => formatTime(p.ts)),
      y: points.map((p) => p.added),
    };
  }, [refreshStats]);

  const regionDistribution = useMemo(
    () => [
      { key: "north_america", label: tr("北美", "North America", "Nordamerika"), value: regionCounts.north_america },
      { key: "europe", label: tr("欧洲", "Europe", "Europa"), value: regionCounts.europe },
      { key: "middle_east", label: tr("中东", "Middle East", "Naher Osten"), value: regionCounts.middle_east },
      { key: "australia", label: tr("澳洲", "Australia", "Australien"), value: regionCounts.australia },
      { key: "africa", label: tr("非洲", "Africa", "Afrika"), value: regionCounts.africa },
      { key: "neutral_zone", label: tr("中立区", "Neutral Zone", "Neutrale Zone"), value: regionCounts.neutral_zone },
      { key: "east_asia", label: tr("东亚", "East Asia", "Ostasien"), value: regionCounts.east_asia },
      { key: "greater_china", label: tr("大中华", "Greater China", "Grosschina"), value: regionCounts.greater_china },
      { key: "se_asia", label: tr("东南亚", "Southeast Asia", "Suedostasien"), value: regionCounts.se_asia },
    ],
    [regionCounts, lang]
  );

  const addedByRegionStats = useMemo(() => {
    const totals = {
      north_america: 0,
      europe: 0,
      middle_east: 0,
      australia: 0,
      africa: 0,
      neutral_zone: 0,
      east_asia: 0,
      greater_china: 0,
      se_asia: 0,
      other: 0,
    };
    refreshStats.forEach((r) => {
      totals.north_america += r.added_by_region?.north_america || 0;
      totals.europe += r.added_by_region?.europe || 0;
      totals.middle_east += r.added_by_region?.middle_east || 0;
      totals.australia += r.added_by_region?.australia || 0;
      totals.africa += r.added_by_region?.africa || 0;
      totals.neutral_zone += r.added_by_region?.neutral_zone || 0;
      totals.east_asia += r.added_by_region?.east_asia || 0;
      totals.greater_china += r.added_by_region?.greater_china || 0;
      totals.se_asia += r.added_by_region?.se_asia || 0;
      totals.other += r.added_by_region?.other || 0;
    });
    return [
      { label: tr("北美", "North America", "Nordamerika"), value: totals.north_america },
      { label: tr("欧洲", "Europe", "Europa"), value: totals.europe },
      { label: tr("中东", "Middle East", "Naher Osten"), value: totals.middle_east },
      { label: tr("澳洲", "Australia", "Australien"), value: totals.australia },
      { label: tr("非洲", "Africa", "Afrika"), value: totals.africa },
      { label: tr("中立区", "Neutral Zone", "Neutrale Zone"), value: totals.neutral_zone },
      { label: tr("东亚", "East Asia", "Ostasien"), value: totals.east_asia },
      { label: tr("大中华", "Greater China", "Grosschina"), value: totals.greater_china },
      { label: tr("东南亚", "Southeast Asia", "Suedostasien"), value: totals.se_asia },
    ];
  }, [refreshStats, lang]);

  const activeMarketItem = useMemo(() => {
    if (!marketModalKey || !market) return null;
    return market.items.find((x) => x.key === marketModalKey) || null;
  }, [market, marketModalKey]);

  const activeMarketSeries = useMemo(() => {
    if (!activeMarketItem) return [];
    const points = marketHistory[activeMarketItem.key] || [];
    return filterMarketSeriesByRange(points, marketRange);
  }, [activeMarketItem, marketHistory, marketRange]);

  return (
    <div className="page">
      {showStartupOverlay && (
        <div className="startup-overlay">
          <div className="startup-card">
            <div className="startup-title">正在加载新闻系统...</div>
            <div className="startup-subtitle">
              {collectStatus?.running
                ? `正在抓取: ${collectStatus.current_source || "准备中"} (${collectStatus.source_done}/${collectStatus.source_total})`
                : "正在初始化配置与数据"}
            </div>
            <div className="progress-track large">
              <div
                className="progress-bar"
                style={{
                  width:
                    collectStatus && collectStatus.source_total > 0
                      ? `${Math.min(100, Math.round((collectStatus.source_done / collectStatus.source_total) * 100))}%`
                      : "15%"
                }}
              />
            </div>
          </div>
        </div>
      )}
      <header className="hero">
        <h1>{t("NewsRoom 本地情报系统", "NewsRoom Local Intelligence")}</h1>
        <div className="top-nav">
          <div className="top-nav-left">
            <button type="button" className="nav-btn" onClick={() => setActiveTab("dashboard")} disabled={activeTab === "dashboard"}>
              {tr("总览", "Dashboard", "Uebersicht")}
            </button>
            <button type="button" className="nav-btn" onClick={() => setActiveTab("owid")} disabled={activeTab === "owid"}>
              OWID Data
            </button>
            <button type="button" className="nav-btn" onClick={() => setShowCreditsModal(true)}>
              {tr("制作者与致谢", "Contributors & Thanks", "Mitwirkende & Dank")}
            </button>
          </div>
          <div className="top-nav-right">
            <button className="nav-btn" onClick={() => setLang("zh")} disabled={lang === "zh"}>中文</button>
            <button className="nav-btn" onClick={() => setLang("en")} disabled={lang === "en"}>English</button>
            <button className="nav-btn" onClick={() => setLang("de")} disabled={lang === "de"}>Deutsch</button>
          </div>
        </div>
      </header>

      {activeTab === "dashboard" ? (
        <>
      <section className="panel market-panel-top">
        <div className="market-header-row">
          <h2>{t("实时金融行情", "Live Market Quotes")}</h2>
          <div className="row market-header-actions">
            <span className="market-local-time">
              {t("本地时间", "Local time")}: {now.toLocaleString(undefined, formatOptions)}
            </span>
            <button
              onClick={() =>
                setMetalUnitMode((m) => (m === "usd_imperial" ? "eur_metric" : "usd_imperial"))
              }
            >
              {metalUnitMode === "usd_imperial" ? t("切换: 欧元公制", "Switch: EUR Metric") : t("切换: 美元英制", "Switch: USD Imperial")}
            </button>
            <button onClick={() => void refreshMarketPanel(true)} disabled={loading || chatLoading || marketChecking}>
              {marketChecking ? tr("检查更新中...", "Checking updates...", "Pruefe Updates...") : t("刷新行情", "Refresh Quotes")}
            </button>
          </div>
        </div>
        {marketRefreshNotice && <div className="market-refresh-notice">{marketRefreshNotice}</div>}
        <div className="market-row">
          {(market?.items || []).map((item) => (
            <div key={item.key} className="market-card">
              <div className="market-main-line">
                <span className="market-title-inline">{item.label}:</span>
                <button
                  type="button"
                  className="market-price-trigger"
                  onClick={() => {
                    setMarketModalKey(item.key);
                    setMarketRange("1h");
                  }}
                >
                  <span className="market-price-inline">{displayMarketPrice(item).value}</span>
                </button>
                <span className="market-unit-inline">{displayMarketPrice(item).unit}</span>
              </div>
              <div className="market-sub-line">
                {tr("来源机构", "Source organization", "Quellorganisation")} {item.source_url ? (
                  <a className="market-source-link" href={item.source_url} target="_blank" rel="noreferrer">
                    {item.source}
                  </a>
                ) : item.source} · {tr("数据发布时间", "Data published at", "Daten veroeffentlicht am")}: {formatDataTimestamp(item.updated_at)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel control-panel">
        <div className="control-layout">
          <div className="row control-left">
            <input
              value={q}
              placeholder={t("关键词搜索", "Keyword search")}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="source-menu" ref={sourceMenuRef}>
              <button
                type="button"
                className={`source-menu-trigger ${sourceMenuOpen ? "open" : ""}`}
                onClick={() => setSourceMenuOpen((v) => !v)}
                aria-expanded={sourceMenuOpen}
              >
                <span className="source-menu-trigger-left">
                  <span className="source-menu-icon" aria-hidden="true">☰</span>
                  <span className="source-menu-title-wrap">
                    <span className="source-menu-title">{t("选择媒体", "Choose Media")}</span>
                    <span className="source-menu-current">{selectedSourceName || t("全部来源", "All Sources")}</span>
                  </span>
                </span>
                <span className={`source-menu-caret ${sourceMenuOpen ? "open" : ""}`} aria-hidden="true">▾</span>
              </button>
              {sourceMenuOpen && (
                <div className="source-menu-panel">
                  <button
                    type="button"
                    className={`source-menu-item all ${sourceId === "" ? "active" : ""}`}
                    onClick={() => {
                      setSourceId("");
                      setSourceMenuOpen(false);
                    }}
                  >
                    {t("全部来源", "All Sources")}
                  </button>
                  <div className="source-menu-carousel">
                    <button
                      type="button"
                      className="source-menu-arrow"
                      disabled={!sourceCanScrollLeft}
                      onClick={() => scrollSourceColumns("left")}
                      aria-label={t("向左查看", "Scroll left")}
                    >
                      ‹
                    </button>
                    <div ref={sourceMenuColumnsRef} className="source-menu-columns" onScroll={updateSourceMenuScrollState}>
                      {sourceMenuColumns.map((col) => (
                        <section key={col.region} className="source-col">
                          <h4>{col.label}</h4>
                        {col.countries.map((country) => (
                          <div key={`${col.region}-${country.country}`} className="source-country-group">
                              {country.label !== col.label && <div className="source-country-title">{country.label}</div>}
                              {country.sources.map((s) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  className={`source-menu-item ${sourceId === s.id ? "active" : ""}`}
                                  onClick={() => {
                                    setSourceId(s.id);
                                    setSourceMenuOpen(false);
                                  }}
                                >
                                  {s.name}
                                </button>
                              ))}
                            </div>
                          ))}
                        </section>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="source-menu-arrow"
                      disabled={!sourceCanScrollRight}
                      onClick={() => scrollSourceColumns("right")}
                      aria-label={t("向右查看", "Scroll right")}
                    >
                      ›
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button onClick={onSearch} disabled={loading}>
              {t("搜索", "Search")}
            </button>
            <button onClick={onCollect} disabled={loading}>
              {t("立即抓取", "Collect Now")}
            </button>
            <button type="button" onClick={() => setActiveTab("stats")}>{tr("统计数据", "Stats", "Statistik")}</button>
          </div>

        </div>
        {error && <div className="error">{error}</div>}
      </section>

      <section className="panel news-layout">
        <div className="content-grid">
          <div className="news-map-zone">
          <aside className="map-panel">
            <h3>{t("媒体来源地区热度（点击筛选）", "Media Origin Heat (click to filter)")}</h3>
            <div className="world-map-wrap">
              <svg viewBox="0 0 800 420" className="world-map" role="img" aria-label="World map with regional news counts">
                <image href="/world.svg" x="0" y="0" width="800" height="420" preserveAspectRatio="xMidYMid meet" className="map-base-image" />

                <g className="map-dot-group">
                  <circle className={`map-dot ${selectedRegion === "north_america" ? "active" : ""}`} cx="170" cy="145" r="28" onClick={() => setSelectedRegion("north_america")} />
                  <text x="170" y="150" textAnchor="middle" className="dot-label">{regionCounts.north_america}</text>
                </g>

                <g className="map-dot-group">
                  <circle className={`map-dot ${selectedRegion === "europe" ? "active" : ""}`} cx="360" cy="130" r="24" onClick={() => setSelectedRegion("europe")} />
                  <text x="360" y="135" textAnchor="middle" className="dot-label">{regionCounts.europe}</text>
                </g>

                <g className="map-dot-group">
                  <circle className={`map-dot ${selectedRegion === "middle_east" ? "active" : ""}`} cx="450" cy="165" r="24" onClick={() => setSelectedRegion("middle_east")} />
                  <text x="450" y="170" textAnchor="middle" className="dot-label">{regionCounts.middle_east}</text>
                </g>

                <g className="map-dot-group">
                  <circle className={`map-dot ${selectedRegion === "africa" ? "active" : ""}`} cx="390" cy="235" r="24" onClick={() => setSelectedRegion("africa")} />
                  <text x="390" y="240" textAnchor="middle" className="dot-label">{regionCounts.africa}</text>
                </g>

                <g className="map-dot-group">
                  <circle className={`map-dot ${selectedRegion === "australia" ? "active" : ""}`} cx="700" cy="300" r="24" onClick={() => setSelectedRegion("australia")} />
                  <text x="700" y="305" textAnchor="middle" className="dot-label">{regionCounts.australia}</text>
                </g>

                <g className="map-dot-group">
                  <circle className={`map-dot ${selectedRegion === "neutral_zone" ? "active" : ""}`} cx="405" cy="110" r="18" onClick={() => setSelectedRegion("neutral_zone")} />
                  <text x="405" y="114" textAnchor="middle" className="dot-label">{regionCounts.neutral_zone}</text>
                </g>

                <g className="map-dot-group">
                  <circle className={`map-dot ${selectedRegion === "east_asia" ? "active" : ""}`} cx="645" cy="145" r="24" onClick={() => setSelectedRegion("east_asia")} />
                  <text x="645" y="150" textAnchor="middle" className="dot-label">{regionCounts.east_asia}</text>
                </g>

                <g className="map-dot-group">
                  <circle className={`map-dot ${selectedRegion === "greater_china" ? "active" : ""}`} cx="610" cy="165" r="28" onClick={() => setSelectedRegion("greater_china")} />
                  <text x="610" y="170" textAnchor="middle" className="dot-label">{regionCounts.greater_china}</text>
                </g>

                <g className="map-dot-group">
                  <circle className={`map-dot ${selectedRegion === "se_asia" ? "active" : ""}`} cx="620" cy="235" r="24" onClick={() => setSelectedRegion("se_asia")} />
                  <text x="620" y="240" textAnchor="middle" className="dot-label">{regionCounts.se_asia}</text>
                </g>
              </svg>
            </div>
            <div className="map-legend">
              <button onClick={() => setSelectedRegion("all")} disabled={selectedRegion === "all"}>{t("查看全部", "View All")}</button>
              <span>{t("北美", "North America")} {regionCounts.north_america}</span>
              <span>{t("欧洲", "Europe")} {regionCounts.europe}</span>
              <span>{t("中东", "Middle East")} {regionCounts.middle_east}</span>
              <span>{t("非洲", "Africa")} {regionCounts.africa}</span>
              <span>{t("澳洲", "Australia")} {regionCounts.australia}</span>
              <span>{t("中立区", "Neutral Zone")} {regionCounts.neutral_zone}</span>
              <span>{t("东亚", "East Asia")} {regionCounts.east_asia}</span>
              <span>{t("大中华", "Greater China")} {regionCounts.greater_china}</span>
              <span>{t("东南亚", "Southeast Asia")} {regionCounts.se_asia}</span>
            </div>
            <div className="map-translate-box">
              <h4>{t("在线翻译", "Online Translate")}</h4>
              <textarea
                className="map-translate-input"
                value={translateInput}
                onChange={(e) => setTranslateInput(e.target.value)}
                placeholder={t("输入文本后点击翻译", "Enter text then translate")}
                rows={4}
              />
              <div className="row">
                <select value={translateSource} onChange={(e) => setTranslateSource(e.target.value as "auto" | "zh" | "en" | "de" | "ja" | "ko" | "ar" | "fr" | "es") }>
                  <option value="auto">{t("自动检测", "Auto detect")}</option>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="ja">日本語</option>
                  <option value="ko">한국어</option>
                  <option value="ar">العربية</option>
                  <option value="fr">Français</option>
                  <option value="es">Español</option>
                </select>
                <select value={translateTarget} onChange={(e) => setTranslateTarget(e.target.value as "zh" | "en" | "de" | "ja" | "ko" | "ar" | "fr" | "es") }>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="ja">日本語</option>
                  <option value="ko">한국어</option>
                  <option value="ar">العربية</option>
                  <option value="fr">Français</option>
                  <option value="es">Español</option>
                </select>
                <button onClick={onTranslateText} disabled={translateLoading}>
                  {translateLoading ? t("翻译中...", "Translating...") : t("翻译", "Translate")}
                </button>
              </div>
              <div className="map-translate-output">{translateOutput || t("翻译结果会显示在这里", "Translated text will appear here")}</div>
              {translateMeta && (
                <div className="meta-line compact">{t("来源", "Source")}: {translateMeta.source} · {t("目标", "Target")}: {translateMeta.target} · {t("服务", "Provider")}: {translateMeta.provider}</div>
              )}
            </div>
          </aside>

          <div ref={newsColumnRef} className="news-column">
            <div className="news-top-fixed">
              <h2>
                {t("新闻流", "News Feed")} ({t("显示", "Showing")} {visibleNews.length} / {t("当前查询总数", "Total Matches")} {totalCount})
                {selectedRegion !== "all" ? ` - ${regionLabel(selectedRegion, lang)}` : ""}
              </h2>
              <div className="selected-summary">
                <span>{t("已勾选新闻", "Selected News")}: {selectedNewsIds.length}</span>
                <button type="button" onClick={() => void checkNewsUpdatesNow()} disabled={checkingUpdates || autoCollecting}>
                  {autoCollecting
                    ? tr("自动抓取中...", "Auto collecting...", "Auto-Erfassung...")
                    : checkingUpdates
                      ? tr("检查更新中...", "Checking updates...", "Pruefe Updates...")
                      : tr("立即检查更新", "Check updates now", "Jetzt auf Updates pruefen")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSelectedList((v) => !v)}
                >
                  {showSelectedList ? t("隐藏勾选列表", "Hide selected list") : t("显示勾选列表", "Show selected list")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSelectedOnly((v) => !v)}
                  disabled={!showSelectedOnly && selectedNewsIds.length === 0}
                >
                  {showSelectedOnly ? t("显示全部新闻", "Show all news") : t("只看勾选新闻", "Only selected")}
                </button>
                <button
                  type="button"
                  onClick={clearSelectedNews}
                  disabled={selectedNewsIds.length === 0}
                >
                  {t("取消全部勾选", "Clear selection")}
                </button>
              </div>
              {newsRefreshNotice && <div className="news-refresh-notice">{newsRefreshNotice}</div>}
              {(selectingNewsLoading || refiningLoading) && (
                <div className="selection-progress-box">
                  <div className="selection-progress-label">
                    {selectingNewsLoading
                      ? tr("正在按条件筛选并勾选新闻...", "Selecting and checking news...", "Nachrichten werden gefiltert und markiert...")
                      : tr("正在根据补充条件精简选集...", "Refining selected set...", "Auswahl wird verfeinert...")}
                  </div>
                  <div className="selection-progress-track">
                    <div className="selection-progress-bar" />
                  </div>
                </div>
              )}
              {showSelectedList && (
                <div className="selected-list-panel">
                  {selectedNewsPreview.length === 0 ? (
                    <div className="selected-list-empty">{t("当前没有勾选新闻", "No selected news")}</div>
                  ) : (
                    selectedNewsPreview.map((item) => (
                      <div key={`selected-${item.id}`} className="selected-list-item">
                        <span className="selected-item-id">#{item.id}</span>
                        <span className="selected-item-source">{item.source}</span>
                        <span className="selected-item-title">{item.title}</span>
                        <button type="button" className="selected-item-remove" onClick={() => toggleSelectNews(item.id)}>
                          {t("取消", "Remove")}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="list">
              {newsCards}
            </div>
            {!isPageAtTop && (
              <div className="news-top-btn-wrap">
                <button className="news-top-btn" onClick={scrollNewsToTop} title={t("回到新闻顶部", "Back to top")}> 
                  {t("回到顶部", "Back to Top")}
                </button>
              </div>
            )}
          </div>

          {newsMapBusy && (
            <div className="news-map-overlay" role="status" aria-live="polite">
              <div className="news-map-overlay-card">
                <div className="news-map-overlay-title">
                  {collectStatus?.running
                    ? tr("新闻流更新中...", "News stream updating...", "News-Stream wird aktualisiert...")
                    : checkingUpdates
                      ? tr("检查更新中...", "Checking updates...", "Pruefe Updates...")
                      : tr("刷新中...", "Refreshing...", "Aktualisiere...")}
                </div>
                {collectStatus?.running && (
                  <div className="news-map-overlay-sub">
                    {tr("当前来源", "Current source", "Aktuelle Quelle")}: {collectStatus.current_source || "-"} ({collectStatus.source_done}/{collectStatus.source_total})
                  </div>
                )}
                <div className="selection-progress-track">
                  {collectStatus?.running ? (
                    <div className="news-map-progress-fill" style={{ width: `${collectProgressPercent}%` }} />
                  ) : (
                    <div className="selection-progress-bar" />
                  )}
                </div>
              </div>
            </div>
          )}
          </div>

          <aside ref={llmPanelRef} className="llm-panel" onMouseDownCapture={snapLlmPanelToViewport}>
            <h3>{t("LLM 分析助手", "LLM Analysis Assistant")}</h3>
            <div className={`llm-drawer ${llmDrawerOpen ? "open" : "collapsed"}`}>
              <button
                type="button"
                className="llm-drawer-handle"
                onClick={() => setLlmDrawerOpen((v) => !v)}
                aria-expanded={llmDrawerOpen}
              >
                <span className="llm-drawer-title">
                  {llmDrawerOpen ? t("收起控制面板", "Collapse controls") : t("展开控制面板", "Expand controls")}
                </span>
                <span className="llm-drawer-arrow">{llmDrawerOpen ? "▲" : "▼"}</span>
              </button>

              {!llmDrawerOpen && (
                <div className="llm-drawer-summary">
                  <span className="llm-summary-item">{t("模型", "Model")}: {llmModels?.current_model || llmModelDraft || "-"}</span>
                  <span className="llm-summary-item">{t("模式", "Mode")}: {chatModeDisplay}</span>
                  <span className="llm-summary-item">{t("勾选", "Selected")}: {selectedNewsIds.length}</span>
                </div>
              )}

              {llmDrawerOpen && (
                <div className="llm-drawer-body">
                  <div className="llm-controls">
                    <div className="row llm-model-row">
                      <select
                        value={llmModelDraft || llmModels?.current_model || ""}
                        onChange={(e) => void onSelectModel(e.target.value)}
                        disabled={!llmModels?.can_switch || chatLoading}
                      >
                        {(llmModels?.models || []).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <button onClick={() => void loadLlmModels()} disabled={chatLoading}>{t("刷新模型", "Refresh Models")}</button>
                    </div>
                    <div className="row llm-select-row">
                      <input
                        className="llm-select-input"
                        value={autoSelectPrompt}
                        onChange={(e) => setAutoSelectPrompt(e.target.value)}
                        placeholder={t("自动勾选条件：如 关税+德国+汽车", "Auto-select prompt: e.g. tariff + Germany + auto" )}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void onLlmAutoSelectNews();
                          }
                        }}
                      />
                      <button onClick={() => void onLlmAutoSelectNews()} disabled={chatLoading || selectingNewsLoading}>
                        {selectingNewsLoading ? t("自动勾选中...", "Auto-selecting...") : t("按条件自动勾选", "Auto Select by Prompt")}
                      </button>
                    </div>
                    <div className="row llm-mode-row">
                      <div className="row llm-mode-left">
                        <select value={chatMode} onChange={(e) => setChatMode(e.target.value as "filtered" | "all" | "selected") }>
                          <option value="filtered">{t("基于当前筛选", "Current filters")}</option>
                          <option value="all">{t("基于全库新闻(按上限抽取)", "All news (capped)")}</option>
                          <option value="selected">{t("基于勾选新闻", "Selected news")}</option>
                        </select>
                        <select value={chatLimit} onChange={(e) => setChatLimit(Number(e.target.value))}>
                          <option value={8}>{t("快速(8条)", "Quick (8)")}</option>
                          <option value={16}>{t("标准(16条)", "Standard (16)")}</option>
                          <option value={32}>{t("深入(32条, 分批综合)", "Deep (32)")}</option>
                          <option value={64}>{t("大量(64条, 分批综合)", "Bulk (64)")}</option>
                          <option value={120}>{t("极限(120条, 分批综合)", "Max (120)")}</option>
                        </select>
                      </div>
                      <div className="row llm-memory-actions">
                        <button onClick={() => void loadChatMemory()} disabled={chatLoading}>{t("读取24小时记录", "Load 24h history")}</button>
                        <button onClick={() => void clearChatMemory()} disabled={chatLoading}>{t("清空记录", "Clear history")}</button>
                        <button onClick={onRefineAndRerun} disabled={chatLoading || selectingNewsLoading || refiningLoading}>
                          {refiningLoading ? t("补充检索中...", "Refining...") : t("补充检索并重分析", "Refine Search + Rerun")}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="llm-notes">
                    <div className="meta-line">{t("问答流程：先由 LLM 根据问题在当前范围自动勾选新闻，再只基于勾选结果分析。", "Q&A flow: LLM first auto-selects news in current scope, then analyzes only selected items.")}</div>
                    <div className="meta-line">{t("范围模式只影响自动勾选的候选池（当前筛选 / 全库 / 仅已勾选）。", "Scope mode only affects selection candidate pool (filtered / all / already selected).")}</div>
                    <div className="meta-line">{t("全库模式已启用随机+来源轮转候选机制，避免按时间或媒体顺序导致的集中偏差。", "All-mode now uses random + source-rotation candidate balancing to reduce time/source ordering bias.")}</div>
                    <div className="meta-line">{t("条数上限由你选择（8/16/32/64/120），最终分析会截取该上限数量。", "You control analysis size (8/16/32/64/120); final analysis is capped to that selected count.")}</div>
                    <div className="meta-line">{t("可拖拽输入框上方边框手动调节高度。", "Drag top border above input to resize input area.")}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="llm-middle-scroll">
              {chatHistory.length > renderedChatHistory.length && (
                <div className="chat-trim-hint">{t(`为保证流畅，仅渲染最近 ${renderedChatHistory.length} 条对话。`, `For performance, only latest ${renderedChatHistory.length} messages are rendered.`)}</div>
              )}
              <div ref={chatBoxRef} className="chat-box">
                {renderedChatHistory.map((item, idx) => (
                  <div key={`${item.role}-${idx}`} className={`chat-row ${item.role}`}>
                    <div className={`chat-bubble ${item.role}`}>
                      <div className={`chat-author ${item.role}`}>{item.role === "user" ? t("你", "You") : "LLM"}</div>
                      {item.role === "assistant" ? (
                        <div className="chat-markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="chat-markdown">{item.text}</div>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && pendingUserPrompt && renderedChatHistory[renderedChatHistory.length - 1]?.text !== pendingUserPrompt && (
                  <div className="chat-row user">
                    <div className="chat-bubble user">
                      <div className="chat-author user">{t("你", "You")}</div>
                      <div className="chat-markdown">{pendingUserPrompt}</div>
                    </div>
                  </div>
                )}
              </div>
              {!isChatAtBottom && (
                <button type="button" className="chat-latest-fab" onClick={scrollChatToLatest}>
                  {t("回到最新消息", "Jump to latest")}
                </button>
              )}
            </div>

            <div className="llm-bottom-fixed">
              {(chatLoading || selectingNewsLoading || refiningLoading) && (
                <div className="llm-generating-hint llm-generating-hint-bottom">
                  {chatLoading
                    ? t("LLM 正在生成回复，请稍候...", "LLM is generating a response, please wait...")
                    : selectingNewsLoading
                      ? t("LLM 正在筛选新闻并自动勾选，请稍候...", "LLM is selecting news and checking items, please wait...")
                      : t("LLM 正在补充检索并重分析，请稍候...", "LLM is refining search and rerunning analysis, please wait...")}
                </div>
              )}
              <div className="chat-input-resizer" onMouseDown={startResizeChatInput} title={t("向上拖拽可增大输入框", "Drag upward to enlarge input")} />
              <textarea
                ref={chatInputRef}
                className="chat-input"
                onKeyDown={onChatInputKeyDown}
                placeholder={t("例如：总结今天欧洲和中东政治风险，并给出市场影响。", "Example: Summarize key political risks and market impact.")}
                rows={5}
                style={{ height: `${chatInputHeight}px` }}
              />
              <div className="llm-input-actions">
                <button
                  type="button"
                  className={`context-toggle ${useNewsContext ? "is-on" : "is-off"}`}
                  aria-pressed={useNewsContext}
                  onClick={() => setUseNewsContext((v) => !v)}
                >
                  {useNewsContext
                    ? tr("新闻上下文：已开启", "News context: On", "News-Kontext: Ein")
                    : tr("新闻上下文：已关闭", "News context: Off", "News-Kontext: Aus")}
                </button>
                <button onClick={onChat} disabled={chatLoading || selectingNewsLoading || refiningLoading}>
                  {chatLoading ? tr("生成回答中...", "Generating response...", "Antwort wird erstellt...") : tr("发送给LLM", "Send to LLM", "An LLM senden")}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </section>

      </>
      ) : activeTab === "owid" ? (
        <section className="panel owid-panel">
          <div className="owid-header-row">
            <h2>{tr("OWID 随机数据模块", "OWID Random Data Modules", "OWID Zufallsdaten-Module")}</h2>
            <button type="button" onClick={() => void refreshOwidModules()} disabled={owidLoading}>
              {owidLoading ? tr("抽取中...", "Refreshing...", "Aktualisiere...") : tr("随机刷新", "Refresh Random", "Zufaellig aktualisieren")}
            </button>
          </div>
          <div className="meta-line">{tr("每次登录或刷新都会随机抽取若干组 OWID 指标。", "A random subset of OWID indicators is loaded on each login/refresh.", "Bei jedem Login oder Refresh wird eine zufaellige Auswahl von OWID-Indikatoren geladen.")}</div>
          {owidError && <div className="error">{owidError}</div>}
          <div className="owid-grid">
            {owidModules.length > 0 ? owidModules : <div className="meta-line">{tr("暂无数据", "No data yet", "Noch keine Daten")}</div>}
          </div>
        </section>
      ) : (
        <section className="panel stats-panel">
          <div className="stats-header-row">
            <h2>{tr("新闻刷新统计", "News Refresh Statistics", "News-Refresh-Statistik")}</h2>
            <div className="row">
              <button type="button" onClick={() => setActiveTab("dashboard")}>{tr("返回总览", "Back to dashboard", "Zurueck zur Uebersicht")}</button>
              <button type="button" onClick={() => setRefreshStats([])} disabled={refreshStats.length === 0}>{tr("清空统计", "Clear stats", "Statistik leeren")}</button>
            </div>
          </div>

          {collectStatus && (
            <div className="stats-capture-status">
              <div className="stats-capture-title">
                {tr("抓取状态", "Collection status", "Erfassungsstatus")}: {collectStatus.running ? tr("运行中", "Running", "Laeuft") : tr("空闲", "Idle", "Leerlauf")}
              </div>
              <div className="stats-capture-sub">
                {tr("当前源", "Current source", "Aktuelle Quelle")}: {collectStatus.current_source || "-"} · {tr("进度", "Progress", "Fortschritt")}: {collectStatus.source_done}/{collectStatus.source_total}
              </div>
              <div className="progress-track full">
                <div className="progress-bar" style={{ width: `${collectProgressPercent}%` }} />
              </div>
            </div>
          )}

          <div className="stats-info-strip">
            {seedResult && (
              <span className="meta-line compact control-chip">{tr("源同步", "Source sync", "Quellen-Sync")}: active {seedResult.active}, inserted {seedResult.inserted}, updated {seedResult.updated}, removed {seedResult.removed}</span>
            )}
            {collectResult && (
              <span className="meta-line compact control-chip">{tr("抓取结果", "Collect result", "Erfassungsresultat")}: fetched {collectResult.fetched_count}, inserted {collectResult.inserted_count}, duplicate {collectResult.duplicate_count}</span>
            )}
            {collectResult?.pruned && (
              <span className="meta-line compact control-chip">{tr("自动清理", "Auto prune", "Auto-Bereinigung")}: news {collectResult.pruned.news}, raw {collectResult.pruned.raw_news}, analysis {collectResult.pruned.analysis}</span>
            )}
          </div>

          <div className="stats-grid">
            <div className="stats-card"><div className="stats-k">{tr("检查次数", "Checks", "Pruefungen")}</div><div className="stats-v">{refreshStatsSummary.totalChecks}</div></div>
            <div className="stats-card"><div className="stats-k">{tr("新增总数", "Total new", "Neue gesamt")}</div><div className="stats-v">{refreshStatsSummary.totalAdded}</div></div>
            <div className="stats-card"><div className="stats-k">{tr("平均每分钟新增", "Avg new/min", "Ø neu/min")}</div><div className="stats-v">{refreshStatsSummary.avgPerMinute.toFixed(2)}</div></div>
            <div className="stats-card"><div className="stats-k">{tr("每次检查平均新增", "Avg/check", "Ø je Pruefung")}</div><div className="stats-v">{refreshStatsSummary.avgPerCheck.toFixed(2)}</div></div>
            <div className="stats-card"><div className="stats-k">{tr("有新增的次数", "Checks with new", "Pruefungen mit neuen")}</div><div className="stats-v">{refreshStatsSummary.withNew}</div></div>
            <div className="stats-card"><div className="stats-k">{tr("单次最大新增", "Max in one check", "Max pro Pruefung")}</div><div className="stats-v">{refreshStatsSummary.maxAdded}</div></div>
          </div>

          <div className="stats-plot-grid">
            <div className="stats-plot-card">
              <h4>{tr("刷新新增趋势", "New items per refresh", "Neue Eintraege je Refresh")}</h4>
              <Plot
                data={[{ x: refreshTrend.x, y: refreshTrend.y, type: "bar", marker: { color: "#3c7e73" } }]}
                layout={{ autosize: true, height: 300, margin: { l: 46, r: 12, t: 8, b: 54 }, xaxis: { tickangle: -25 }, yaxis: { title: { text: tr("新增条数", "New items", "Neue Eintraege") } }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(255,255,255,0.6)" }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%", height: "300px" }}
                useResizeHandler
              />
            </div>
            <div className="stats-plot-card">
              <h4>{tr("媒体地区分布", "Media region distribution", "Medien-Regionenverteilung")}</h4>
              <Plot
                data={[{ labels: regionDistribution.map((x) => x.label), values: regionDistribution.map((x) => x.value), type: "pie", hole: 0.45, marker: { colors: ["#4f8b80", "#5f7eb3", "#c9833a", "#8b6cb0", "#53a289", "#9c9588"] } }]}
                layout={{ autosize: true, height: 300, margin: { l: 10, r: 10, t: 6, b: 6 }, paper_bgcolor: "rgba(0,0,0,0)" }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%", height: "300px" }}
                useResizeHandler
              />
            </div>
            <div className="stats-plot-card">
              <h4>{tr("新增新闻按地区统计", "New items by region", "Neue Eintraege nach Region")}</h4>
              <Plot
                data={[{ x: addedByRegionStats.map((x) => x.label), y: addedByRegionStats.map((x) => x.value), type: "bar", marker: { color: "#7b9fce" } }]}
                layout={{ autosize: true, height: 300, margin: { l: 36, r: 10, t: 8, b: 40 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(255,255,255,0.6)", yaxis: { title: { text: tr("新增条数", "New items", "Neue Eintraege") } } }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: "100%", height: "300px" }}
                useResizeHandler
              />
            </div>
          </div>

          <div className="stats-table-wrap">
            <h4>{tr("最近刷新记录", "Recent refresh log", "Letzte Refresh-Protokolle")}</h4>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>{tr("时间", "Time", "Zeit")}</th>
                  <th>{tr("来源", "Trigger", "Ausloeser")}</th>
                  <th>{tr("新增", "Added", "Neu")}</th>
                  <th>{tr("抓取入库", "Inserted", "Eingefuegt")}</th>
                  <th>{tr("抓取重复", "Duplicate", "Duplikat")}</th>
                  <th>{tr("当前源", "Current source", "Aktuelle Quelle")}</th>
                  <th>{tr("查询", "Query", "Abfrage")}</th>
                  <th>{tr("地区", "Region", "Region")}</th>
                  <th>{tr("勾选", "Selected", "Auswahl")}</th>
                </tr>
              </thead>
              <tbody>
                {refreshStats.slice(0, 80).map((r, idx) => (
                  <tr key={`stat-${idx}-${r.ts}`}>
                    <td>{formatTime(r.ts)}</td>
                    <td>{r.trigger}</td>
                    <td>{r.added}</td>
                    <td>{r.inserted_count ?? "-"}</td>
                    <td>{r.duplicate_count ?? "-"}</td>
                    <td>{r.current_source || "-"}</td>
                    <td>{r.q || "-"}</td>
                    <td>{regionLabel(r.region, lang)}</td>
                    <td>{r.selected_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeMarketItem && (
        <div className="data-modal-overlay" onClick={() => setMarketModalKey(null)}>
          <div className="data-modal" onClick={(e) => e.stopPropagation()}>
            <div className="data-modal-header">
              <h3>{activeMarketItem.label}</h3>
              <button type="button" onClick={() => setMarketModalKey(null)}>{tr("关闭", "Close", "Schliessen")}</button>
            </div>
            <div className="data-modal-sub">
              {tr("来源机构", "Source organization", "Quellorganisation")}: {activeMarketItem.source_url ? (
                <a href={activeMarketItem.source_url} target="_blank" rel="noreferrer">{activeMarketItem.source}</a>
              ) : activeMarketItem.source}
              {" · "}
              {tr("数据发布时间", "Data published at", "Daten veroeffentlicht am")}: {formatDataTimestamp(activeMarketItem.updated_at)}
            </div>
            <div className="data-modal-range-row">
              {([
                ["15m", tr("15分钟", "15m", "15m")],
                ["1h", tr("1小时", "1h", "1h")],
                ["6h", tr("6小时", "6h", "6h")],
                ["24h", tr("24小时", "24h", "24h")],
                ["all", tr("全部", "All", "Alle")],
              ] as [MarketRange, string][]).map(([key, label]) => (
                <button
                  key={`range-${key}`}
                  type="button"
                  className={`data-range-btn ${marketRange === key ? "active" : ""}`}
                  onClick={() => setMarketRange(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <Plot
              data={[
                {
                  x: activeMarketSeries.map((p) => p.ts),
                  y: activeMarketSeries.map((p) => p.price),
                  type: "scatter",
                  mode: "lines+markers",
                  line: { color: "#2f7f6f", width: 2.4 },
                  marker: { color: "#2f7f6f", size: 4 },
                  hovertemplate: "%{x}<br>%{y}<extra></extra>",
                },
              ]}
              layout={{
                autosize: true,
                height: 360,
                margin: { l: 56, r: 14, t: 10, b: 56 },
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "rgba(255,255,255,0.7)",
                xaxis: {
                  title: { text: tr("时间", "Time", "Zeit") },
                  tickangle: -20,
                },
                yaxis: {
                  title: { text: activeMarketItem.unit || tr("数值", "Value", "Wert") },
                },
                showlegend: false,
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%", height: "360px" }}
              useResizeHandler
            />
          </div>
        </div>
      )}

      {showCreditsModal && (
        <div className="credits-overlay" onClick={() => setShowCreditsModal(false)}>
          <div className="credits-modal" onClick={(e) => e.stopPropagation()}>
            <div className="credits-header">
              <h3>{tr("制作者与致谢", "Contributors & Thanks", "Mitwirkende & Dank")}</h3>
              <button type="button" onClick={() => setShowCreditsModal(false)}>{tr("关闭", "Close", "Schliessen")}</button>
            </div>
            <div className="credits-body">
              <p>
                {tr("本项目主要维护者", "Primary maintainer", "Hauptverantwortlicher")}: <a href="https://github.com/SinuoZhang" target="_blank" rel="noreferrer">SinuoZhang</a>
              </p>
              <p>
                {tr("项目仓库", "Repository", "Repository")}: <a href="https://github.com/SinuoZhang/NewsRoom" target="_blank" rel="noreferrer">github.com/SinuoZhang/NewsRoom</a>
              </p>
              <p>
                {tr("工程协助", "Engineering assistance", "Engineering-Unterstuetzung")}: OpenCode / Codex
              </p>
              <div className="credits-links">
                <a href="https://github.com/SinuoZhang/NewsRoom/blob/main/ACKNOWLEDGEMENTS.md" target="_blank" rel="noreferrer">
                  {tr("完整致谢", "Full acknowledgements", "Vollstaendige Danksagung")}
                </a>
                <a href="https://github.com/SinuoZhang/NewsRoom/blob/main/THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">
                  {tr("第三方许可", "Third-party licenses", "Drittanbieter-Lizenzen")}
                </a>
                <a href="https://simplemaps.com/resources/svg-world" target="_blank" rel="noreferrer">
                  {tr("地图引用", "Map citation", "Kartenzitat")}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
