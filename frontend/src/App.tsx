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
  RegionCounts,
  SeedResult,
  Source,
} from "./api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { makeNewsRef } from "./newsRef";

type RegionKey = "all" | "north_america" | "europe" | "middle_east" | "greater_china" | "se_asia";
type Lang = "zh" | "en";

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

function regionLabel(region: RegionKey, lang: Lang): string {
  if (lang === "zh") {
    if (region === "all") return "全部";
    if (region === "north_america") return "北美";
    if (region === "europe") return "欧洲";
    if (region === "middle_east") return "中东";
    if (region === "greater_china") return "大中华";
    return "东南亚";
  }
  if (region === "all") return "All";
  if (region === "north_america") return "North America";
  if (region === "europe") return "Europe";
  if (region === "middle_east") return "Middle East";
  if (region === "greater_china") return "Greater China";
  return "Southeast Asia";
}

export function App() {
  const [lang, setLang] = useState<Lang>("zh");
  const [sources, setSources] = useState<Source[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [q, setQ] = useState("");
  const [sourceId, setSourceId] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  const [collectResult, setCollectResult] = useState<CollectResult | null>(null);
  const [collectStatus, setCollectStatus] = useState<CollectStatus | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [totalCount, setTotalCount] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState<RegionKey>("all");
  const [regionCounts, setRegionCounts] = useState<RegionCounts>({
    north_america: 0,
    europe: 0,
    middle_east: 0,
    greater_china: 0,
    se_asia: 0,
    other: 0,
    all: 0
  });
  const [chatMode, setChatMode] = useState<"filtered" | "all" | "selected">("filtered");
  const [useNewsContext, setUseNewsContext] = useState(true);
  const [chatLimit, setChatLimit] = useState(12);
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [selectingNewsLoading, setSelectingNewsLoading] = useState(false);
  const [refiningLoading, setRefiningLoading] = useState(false);
  const [autoSelectPrompt, setAutoSelectPrompt] = useState("");
  const [chatInputHeight, setChatInputHeight] = useState(180);
  const [selectedNewsIds, setSelectedNewsIds] = useState<number[]>([]);
  const [selectedOnlyNews, setSelectedOnlyNews] = useState<News[]>([]);
  const [selectedNewsMeta, setSelectedNewsMeta] = useState<Record<number, { title: string; source: string; url: string; published_at?: string | null }>>({});
  const [showSelectedList, setShowSelectedList] = useState(false);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [llmModels, setLlmModels] = useState<LlmModelsOut | null>(null);
  const [llmModelDraft, setLlmModelDraft] = useState("");
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [metalUnitMode, setMetalUnitMode] = useState<"usd_imperial" | "eur_metric">("usd_imperial");
  const [translateInput, setTranslateInput] = useState("");
  const [translateTarget, setTranslateTarget] = useState<"zh" | "en" | "de">("en");
  const [translateSource, setTranslateSource] = useState<"auto" | "zh" | "en" | "de">("auto");
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateOutput, setTranslateOutput] = useState("");
  const [translateMeta, setTranslateMeta] = useState<{ source: string; target: string; provider: string } | null>(null);
  const [llmDrawerOpen, setLlmDrawerOpen] = useState(false);
  const [isChatAtBottom, setIsChatAtBottom] = useState(true);
  const lastCollectRunningRef = useRef(false);
  const chatLoadingRef = useRef(false);
  const llmPanelRef = useRef<HTMLElement | null>(null);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const newsColumnRef = useRef<HTMLDivElement | null>(null);
  const [isPageAtTop, setIsPageAtTop] = useState(true);
  const showStartupOverlay = !seedResult || !collectStatus || collectStatus.running;

  const sourceMap = useMemo(() => {
    const m = new Map<number, string>();
    sources.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [sources]);

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
    if (saved === "zh" || saved === "en") {
      setLang(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ui_lang", lang);
  }, [lang]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    chatLoadingRef.current = chatLoading;
  }, [chatLoading]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden || chatLoadingRef.current) {
        return;
      }
      void refreshCollectStatus();
    }, 12000);
    void refreshCollectStatus();
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void loadLlmModels();
    void loadChatMemory();
    void refreshMarketPanel();

    const marketTimer = window.setInterval(() => {
      if (!document.hidden) {
        void refreshMarketPanel();
      }
    }, 60000);
    return () => window.clearInterval(marketTimer);
  }, []);

  useEffect(() => {
    if (sources.length === 0) return;
    void onSearch();
  }, [selectedRegion]);

  async function bootstrap() {
    try {
      setError(null);
      const seed = await api.seedSources();
      const [srcs] = await Promise.all([api.getSources()]);
      setSeedResult(seed);
      setSources(srcs);
      await refreshNewsView();
    } catch (e) {
      setError((e as Error).message);
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
      await refreshNewsView();
      return;
    }

    const rows = await api.getNews({
      q: q || undefined,
      source_id: sourceId === "" ? undefined : sourceId,
      region,
      after_id: maxId,
      limit: 200
    });

    if (!rows.length) {
      return;
    }

    setNews((prev) => {
      const merged = [...rows, ...prev];
      return merged.slice(0, 260);
    });
    setTotalCount((prev) => prev + rows.length);
    try {
      const mapCounts = await api.getRegionCounts();
      setRegionCounts(mapCounts);
    } catch {
      // ignore
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
      if (lastCollectRunningRef.current && !status.running) {
        await refreshNewsIncremental();
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

  async function refreshMarketPanel() {
    try {
      const snapshot = await api.getMarketSnapshot();
      setMarket(snapshot);
    } catch {
      // ignore transient market fetch failures
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
    if (chatLoading) return;
    const raw = chatInputRef.current?.value || "";
    const prompt = raw.trim();
    if (!prompt) return;

    const inlineSelectInstruction = extractInlineSelectInstruction(prompt);

    if (chatInputRef.current) {
      chatInputRef.current.value = "";
    }

    if (inlineSelectInstruction) {
      setChatHistory((prev) => [...prev, { role: "user", text: prompt }]);
      await onLlmAutoSelectNews(inlineSelectInstruction, true);
      return;
    }

    setChatLoading(true);
    setChatHistory((prev) => [...prev, { role: "user", text: prompt }]);
    try {
      const region = chatMode === "all" || selectedRegion === "all" ? undefined : selectedRegion;
      const chatSourceId = chatMode === "all" ? undefined : (sourceId === "" ? undefined : sourceId);
      const payload = {
        message: prompt,
        mode: chatMode,
        use_news_context: useNewsContext,
        ui_lang: lang,
        use_chat_history: true,
        history_turns: 12,
        q: chatMode === "filtered" ? (q || undefined) : undefined,
        source_id: chatSourceId,
        region,
        news_ids: selectedNewsIds,
        limit: chatLimit
      };

      const result: LlmChatOut = await api.llmChat(payload);

      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", text: `${result.answer}\n\n[provider=${result.provider}, model=${result.model}, news=${result.used_news_count}]` }
      ]);
    } catch (e) {
      const msg = (e as Error).message || "unknown";
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", text: `请求失败: ${msg}\n建议先切到“快速(8条)”或减少勾选新闻数量后重试。` }
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  function extractInlineSelectInstruction(prompt: string): string | null {
    const text = prompt.trim();
    if (!text) return null;

    const slash = text.match(/^\/(select|autoselect|勾选)\s+(.+)$/i);
    if (slash?.[2]) return slash[2].trim();

    const prefixed = text.match(/^(勾选|请勾选|帮我勾选|筛选并勾选|select|auto\s*select)\s*[：:]?\s*(.+)$/i);
    if (prefixed?.[2]) return prefixed[2].trim();

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
      const region = forceGlobalScope ? undefined : (chatMode === "all" || selectedRegion === "all" ? undefined : selectedRegion);
      const chatSourceId = forceGlobalScope ? undefined : (chatMode === "all" ? undefined : (sourceId === "" ? undefined : sourceId));
      const selectMode = forceGlobalScope ? "all" : chatMode;
      const result: LlmSelectNewsOut = await api.llmSelectNews({
        instruction,
        mode: selectMode,
        q: forceGlobalScope ? undefined : (chatMode === "filtered" ? (q || undefined) : undefined),
        source_id: chatSourceId,
        region,
        news_ids: forceGlobalScope ? [] : selectedNewsIds,
        limit: forceGlobalScope ? 0 : 500
      });

      setSelectedNewsIds(result.selected_ids);
      if (result.selected_ids.length > 0) {
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
            `已根据要求自动勾选 ${result.selected_ids.length} 条新闻（扫描 ${result.scanned_news_count} 条）。\n[provider=${result.provider}, model=${result.model}]\n${result.reason || ""}`,
            `Auto-selected ${result.selected_ids.length} news items (scanned ${result.scanned_news_count}).\n[provider=${result.provider}, model=${result.model}]\n${result.reason || ""}`
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

      setSelectedNewsIds(result.selected_ids);
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
            `已执行补充检索并重分析：新增 ${result.added_ids.length} 条，当前勾选 ${result.selected_ids.length} 条。\n补充关键词：${result.keywords.join(" / ") || "-"}\n${result.missing_points.length ? `待补充信息：${result.missing_points.join("；")}` : ""}\n\n${result.answer}\n\n[provider=${result.provider}, model=${result.model}, news=${result.used_news_count}]`,
            `Refinement rerun complete: added ${result.added_ids.length}, selected ${result.selected_ids.length}.\nKeywords: ${result.keywords.join(" / ") || "-"}\n${result.missing_points.length ? `Missing points: ${result.missing_points.join("; ")}` : ""}\n\n${result.answer}\n\n[provider=${result.provider}, model=${result.model}, news=${result.used_news_count}]`
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

  function scrollChatToLatest() {
    const box = chatBoxRef.current;
    if (!box) return;
    box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }

  useEffect(() => {
    const box = chatBoxRef.current;
    if (!box) return;
    box.scrollTo({ top: box.scrollHeight, behavior: "auto" });
  }, [chatHistory.length]);

  useEffect(() => {
    if (!chatLoading) return;
    const box = chatBoxRef.current;
    if (!box) return;
    box.scrollTo({ top: box.scrollHeight, behavior: "auto" });
  }, [chatLoading]);

  useEffect(() => {
    const box = chatBoxRef.current;
    if (!box) return;
    const onScroll = () => {
      const remain = box.scrollHeight - box.scrollTop - box.clientHeight;
      setIsChatAtBottom(remain <= 28);
    };
    onScroll();
    box.addEventListener("scroll", onScroll, { passive: true });
    return () => box.removeEventListener("scroll", onScroll);
  }, []);

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

  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
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
            <span className="meta-nowrap">
              {t("新闻编号", "News Ref")} {makeNewsRef({ sourceName: item.source_name, title: item.title, publishedAt: item.published_at, collectedAt: item.collected_at, fallbackId: item.id })}
            </span>
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
        <div className="row">
          <button onClick={() => setLang("zh")} disabled={lang === "zh"}>中文</button>
          <button onClick={() => setLang("en")} disabled={lang === "en"}>English</button>
        </div>
      </header>

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
            <button onClick={() => void refreshMarketPanel()} disabled={loading || chatLoading}>{t("刷新行情", "Refresh Quotes")}</button>
          </div>
        </div>
        <div className="market-row">
          {(market?.items || []).map((item) => (
            <div key={item.key} className="market-card">
              <div className="market-main-line">
                <span className="market-title-inline">{item.label}:</span>
                <span className="market-price-inline">{displayMarketPrice(item).value}</span>
                <span className="market-unit-inline">{displayMarketPrice(item).unit}</span>
              </div>
              <div className="market-sub-line">
                来源 {item.source_url ? (
                  <a className="market-source-link" href={item.source_url} target="_blank" rel="noreferrer">
                    {item.source}
                  </a>
                ) : item.source} · {formatTime(item.updated_at)}
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
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">{t("全部来源", "All Sources")}</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button onClick={onSearch} disabled={loading}>
              {t("搜索", "Search")}
            </button>
            <button onClick={onCollect} disabled={loading}>
              {t("立即抓取", "Collect Now")}
            </button>
          </div>

          <div className="control-right">
            <div className="control-info-line">
              {seedResult && (
                <span className="meta-line compact control-chip">源同步: active {seedResult.active}, inserted {seedResult.inserted}, updated {seedResult.updated}, removed {seedResult.removed}</span>
              )}
              {collectResult && (
                <span className="meta-line compact control-chip">抓取结果: fetched {collectResult.fetched_count}, inserted {collectResult.inserted_count}, duplicate {collectResult.duplicate_count}</span>
              )}
              {collectResult?.pruned && (
                <span className="meta-line compact control-chip">自动清理: news {collectResult.pruned.news}, raw {collectResult.pruned.raw_news}, analysis {collectResult.pruned.analysis}</span>
              )}
              {collectStatus && (
                <>
                  <span className="meta-line compact control-chip">
                    抓取状态: {collectStatus.running ? "运行中" : "空闲"}
                    {collectStatus.current_source ? ` | 当前源: ${collectStatus.current_source}` : ""}
                    {collectStatus.source_total > 0 ? ` | 进度: ${collectStatus.source_done}/${collectStatus.source_total}` : ""}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {collectStatus && (
          <div className="control-progress-full">
            <div className="control-progress-label">
              <span>{t("抓取进度", "Collect Progress")}</span>
              <span>{collectProgressPercent}%</span>
            </div>
            <div className="progress-track full">
              <div className="progress-bar" style={{ width: `${collectProgressPercent}%` }} />
            </div>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </section>

      <section className="panel news-layout">
        <div className="content-grid">
          <aside className="map-panel">
            <h3>{t("地区新闻热度（点击筛选）", "Regional News Heat (click to filter)")}</h3>
            <div className="world-map-wrap">
              <svg viewBox="0 0 800 420" className="world-map" role="img" aria-label="World map with regional news counts">
                <rect x="0" y="0" width="800" height="420" rx="18" fill="#e8f0ec" />
                <ellipse cx="170" cy="150" rx="120" ry="80" fill="#cadacf" />
                <ellipse cx="340" cy="145" rx="95" ry="70" fill="#cadacf" />
                <ellipse cx="410" cy="265" rx="70" ry="95" fill="#cadacf" />
                <ellipse cx="560" cy="165" rx="145" ry="85" fill="#cadacf" />
                <ellipse cx="700" cy="285" rx="75" ry="55" fill="#cadacf" />

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
              <span>{t("大中华", "Greater China")} {regionCounts.greater_china}</span>
              <span>{t("东南亚", "Southeast Asia")} {regionCounts.se_asia}</span>
            </div>
            <div className="map-translate-box">
              <h4>{t("在线翻译测试", "Online Translate Test")}</h4>
              <textarea
                className="map-translate-input"
                value={translateInput}
                onChange={(e) => setTranslateInput(e.target.value)}
                placeholder={t("输入文本后点击翻译", "Enter text then translate")}
                rows={4}
              />
              <div className="row">
                <select value={translateSource} onChange={(e) => setTranslateSource(e.target.value as "auto" | "zh" | "en" | "de") }>
                  <option value="auto">{t("自动检测", "Auto detect")}</option>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                </select>
                <select value={translateTarget} onChange={(e) => setTranslateTarget(e.target.value as "zh" | "en" | "de") }>
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
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
              </div>
              {showSelectedList && (
                <div className="selected-list-panel">
                  {selectedNewsPreview.length === 0 ? (
                    <div className="selected-list-empty">{t("当前没有勾选新闻", "No selected news")}</div>
                  ) : (
                    selectedNewsPreview.map((item) => (
                      <div key={`selected-${item.id}`} className="selected-list-item">
                        <span className="selected-item-source">{item.source}</span>
                        <span className="selected-item-title">{item.title}</span>
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
                    <div className="row">
                      <label className="meta-nowrap">
                        <input
                          type="checkbox"
                          checked={useNewsContext}
                          onChange={(e) => setUseNewsContext(e.target.checked)}
                        />
                        {t("基于新闻上下文", "Use news context")}
                      </label>
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
                          <option value={12}>{t("标准(12条)", "Standard (12)")}</option>
                          <option value={20}>{t("深入(20条)", "Deep (20)")}</option>
                          <option value={30}>{t("全面(30条)", "Wide (30)")}</option>
                          <option value={50}>{t("大量(50条, 分批综合)", "Bulk (50)")}</option>
                          <option value={80}>{t("超大(80条, 分批综合)", "Huge (80)")}</option>
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
                    <div className="meta-line">{t("说明: 全库模式会从数据库按最新排序抽取最多N条，不是无上限读取全部。", "All mode reads latest N records from DB, not unlimited full scan.")}</div>
                    <div className="meta-line">{t("当前筛选模式会应用关键词、来源、地区这三类筛选条件。", "Filtered mode applies keyword, source, and region filters.")}</div>
                    <div className="meta-line">{t("当条数大于20时，后端自动分批分析并做综合汇总。", "When limit > 20, backend uses chunked synthesis.")}</div>
                    <div className="meta-line">{t("可拖拽输入框上方边框手动调节高度。", "Drag top border above input to resize input area.")}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="llm-middle-scroll">
              {(chatLoading || selectingNewsLoading || refiningLoading) && (
                <div className="llm-generating-hint">
                  {chatLoading
                    ? t("LLM 正在生成回复，请稍候...", "LLM is generating a response, please wait...")
                    : selectingNewsLoading
                      ? t("LLM 正在筛选新闻并自动勾选，请稍候...", "LLM is selecting news and checking items, please wait...")
                      : t("LLM 正在补充检索并重分析，请稍候...", "LLM is refining search and rerunning analysis, please wait...")}
                </div>
              )}
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
              </div>
              {!isChatAtBottom && (
                <button type="button" className="chat-latest-fab" onClick={scrollChatToLatest}>
                  {t("回到最新消息", "Jump to latest")}
                </button>
              )}
            </div>

            <div className="llm-bottom-fixed">
              <div className="chat-input-resizer" onMouseDown={startResizeChatInput} title={t("向上拖拽可增大输入框", "Drag upward to enlarge input")} />
              <textarea
                ref={chatInputRef}
                className="chat-input"
                onKeyDown={onChatInputKeyDown}
                placeholder={t("例如：总结今天欧洲和中东政治风险，并给出市场影响。", "Example: Summarize key political risks and market impact.")}
                rows={5}
                style={{ height: `${chatInputHeight}px` }}
              />
              <button onClick={onChat} disabled={chatLoading}>
                {chatLoading ? t("分析中...", "Analyzing...") : t("发送给LLM", "Send to LLM")}
              </button>
            </div>
          </aside>
        </div>
      </section>

    </div>
  );
}
