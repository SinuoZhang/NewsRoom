import { type KeyboardEvent, type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  CollectResult,
  CollectStatus,
  LlmChatOut,
  LlmModelsOut,
  MarketSnapshot,
  News,
  RegionCounts,
  SeedResult,
  Source,
} from "./api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type RegionKey = "all" | "north_america" | "europe" | "middle_east" | "greater_china" | "se_asia";

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

function regionLabel(region: RegionKey): string {
  if (region === "all") return "全部";
  if (region === "north_america") return "北美";
  if (region === "europe") return "欧洲";
  if (region === "middle_east") return "中东";
  if (region === "greater_china") return "大中华";
  return "东南亚";
}

export function App() {
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
  const [chatInputHeight, setChatInputHeight] = useState(180);
  const [selectedNewsIds, setSelectedNewsIds] = useState<number[]>([]);
  const [selectedNewsMeta, setSelectedNewsMeta] = useState<Record<number, { title: string; source: string; url: string }>>({});
  const [showSelectedList, setShowSelectedList] = useState(false);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [llmModels, setLlmModels] = useState<LlmModelsOut | null>(null);
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [metalUnitMode, setMetalUnitMode] = useState<"usd_imperial" | "eur_metric">("usd_imperial");
  const lastCollectRunningRef = useRef(false);
  const chatLoadingRef = useRef(false);
  const llmPanelRef = useRef<HTMLElement | null>(null);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const newsColumnRef = useRef<HTMLDivElement | null>(null);
  const [isChatAtBottom, setIsChatAtBottom] = useState(true);
  const [isPageAtTop, setIsPageAtTop] = useState(true);
  const showStartupOverlay = !seedResult || !collectStatus || collectStatus.running;

  const sourceMap = useMemo(() => {
    const m = new Map<number, string>();
    sources.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [sources]);

  const visibleNews = useMemo(() => {
    if (!showSelectedOnly) return news;
    const selected = new Set(selectedNewsIds);
    return news.filter((item) => selected.has(item.id));
  }, [news, showSelectedOnly, selectedNewsIds]);

  useEffect(() => {
    if (showSelectedOnly && selectedNewsIds.length === 0) {
      setShowSelectedOnly(false);
    }
  }, [showSelectedOnly, selectedNewsIds.length]);

  const selectedNewsPreview = useMemo(
    () =>
      selectedNewsIds.map((id) => {
        const item = news.find((n) => n.id === id);
        const meta = selectedNewsMeta[id];
        return {
          id,
          title: item?.title || meta?.title || "(当前筛选未加载该新闻标题)",
          source: item?.source_name || meta?.source || "未知来源",
          url: item?.url || meta?.url || ""
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
  }, []);

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
    try {
      const data = await api.selectLlmModel(model);
      setLlmModels(data);
    } catch (e) {
      setError((e as Error).message);
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
    if (chatInputRef.current) {
      chatInputRef.current.value = "";
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

  function snapLlmPanelToViewport() {
    const panel = llmPanelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const targetTop = 12;
    const delta = rect.top - targetTop;
    if (Math.abs(delta) > 8) {
      window.scrollBy({ top: delta, behavior: "smooth" });
    }
  }

  function scrollChatToLatest() {
    const box = chatBoxRef.current;
    if (!box) return;
    box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
    window.setTimeout(() => setIsChatAtBottom(true), 250);
  }

  function updateChatBottomState() {
    const box = chatBoxRef.current;
    if (!box) return;
    const distance = box.scrollHeight - (box.scrollTop + box.clientHeight);
    setIsChatAtBottom(distance <= 16);
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

  useEffect(() => {
    const box = chatBoxRef.current;
    if (!box) return;
    box.scrollTo({ top: box.scrollHeight, behavior: "auto" });
    setIsChatAtBottom(true);
  }, [chatHistory.length]);

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

  const newsCards = useMemo(
    () =>
      visibleNews.map((item) => (
        <article key={item.id} className="card">
          <div className="meta">
            <span>{sourceMap.get(item.source_id) || item.source_name}</span>
            <span className="meta-nowrap">published(本地) {formatTime(item.published_at)}</span>
          </div>
          <div className="meta">
            <label className="meta-nowrap">
              <input type="checkbox" checked={selectedNewsIdSet.has(item.id)} onChange={() => toggleSelectNews(item.id)} /> 选中用于LLM
            </label>
          </div>
          <div className="meta">
            <span className="meta-nowrap">published(来源地) {formatSourceTime(item.published_at, item.source_timezone)}</span>
            <span className="meta-nowrap">source TZ {item.source_timezone}</span>
          </div>
          <div className="meta">
            <span className="meta-nowrap">collected {formatTime(item.collected_at)}</span>
            <span>impact {item.impact_score.toFixed(0)}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.content || "(no content)"}</p>
          <a className="news-url" href={item.url} target="_blank" rel="noreferrer" title={item.url}>
            {item.url}
          </a>
        </article>
      )),
    [visibleNews, sourceMap, selectedNewsIdSet, toggleSelectNews]
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
        <h1>NewsRoom Local Intelligence</h1>
        <p>本地新闻聚合（先确保抓取和展示格式正确）</p>
        <p>当前本地时间: {now.toLocaleString(undefined, formatOptions)}</p>
      </header>

      <section className="panel market-panel-top">
        <div className="market-header-row">
          <h2>实时金融行情</h2>
          <div className="row">
            <button
              onClick={() =>
                setMetalUnitMode((m) => (m === "usd_imperial" ? "eur_metric" : "usd_imperial"))
              }
            >
              {metalUnitMode === "usd_imperial" ? "切换: 欧元公制" : "切换: 美元英制"}
            </button>
            <button onClick={() => void refreshMarketPanel()} disabled={loading || chatLoading}>刷新行情</button>
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
                来源 {item.source} · {formatTime(item.updated_at)}
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
              placeholder="关键词搜索"
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">全部来源</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button onClick={onSearch} disabled={loading}>
              搜索
            </button>
            <button onClick={onCollect} disabled={loading}>
              立即抓取
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
              <span>抓取进度</span>
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
            <h3>地区新闻热度（点击筛选）</h3>
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
            <div className="map-legend">
              <button onClick={() => setSelectedRegion("all")} disabled={selectedRegion === "all"}>查看全部</button>
              <span>北美 {regionCounts.north_america}</span>
              <span>欧洲 {regionCounts.europe}</span>
              <span>中东 {regionCounts.middle_east}</span>
              <span>大中华 {regionCounts.greater_china}</span>
              <span>东南亚 {regionCounts.se_asia}</span>
            </div>
          </aside>

          <div ref={newsColumnRef} className="news-column">
            <div className="news-top-fixed">
              <h2>
                新闻流（显示 {visibleNews.length} / 当前查询总数 {totalCount}）
                {selectedRegion !== "all" ? ` - ${regionLabel(selectedRegion)}` : ""}
              </h2>
              <div className="selected-summary">
                <span>已勾选新闻: {selectedNewsIds.length}</span>
                <button
                  type="button"
                  onClick={() => setShowSelectedList((v) => !v)}
                >
                  {showSelectedList ? "隐藏勾选列表" : "显示勾选列表"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSelectedOnly((v) => !v)}
                  disabled={!showSelectedOnly && selectedNewsIds.length === 0}
                >
                  {showSelectedOnly ? "显示全部新闻" : "只看勾选新闻"}
                </button>
                {selectedNewsIds.length > 0 && (
                  <span className="selected-ids">ID: {selectedNewsIds.join(", ")}</span>
                )}
              </div>
              {showSelectedList && (
                <div className="selected-list-panel">
                  {selectedNewsPreview.length === 0 ? (
                    <div className="selected-list-empty">当前没有勾选新闻</div>
                  ) : (
                    selectedNewsPreview.map((item) => (
                      <div key={`selected-${item.id}`} className="selected-list-item">
                        <span className="selected-item-id">#{item.id}</span>
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
                <button className="news-top-btn" onClick={scrollNewsToTop} title="回到新闻顶部">
                  回到顶部
                </button>
              </div>
            )}
          </div>

          <aside ref={llmPanelRef} className="llm-panel" onMouseDownCapture={snapLlmPanelToViewport}>
            <h3>LLM 分析助手</h3>
            <div className="llm-top-grid llm-top-fixed">
              <div className="llm-controls">
                <div className="row">
                  <select
                    value={llmModels?.current_model || ""}
                    onChange={(e) => void onSelectModel(e.target.value)}
                    disabled={!llmModels?.can_switch || chatLoading}
                  >
                    {(llmModels?.models || []).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => void loadLlmModels()} disabled={chatLoading}>刷新模型</button>
                </div>
                <div className="meta-line">
                  当前模型: {llmModels?.current_model || "-"}
                  {llmModels ? ` (${llmModels.provider})` : ""}
                </div>
                <div className="row">
                  <button onClick={() => void loadChatMemory()} disabled={chatLoading}>读取24小时记录</button>
                  <button onClick={() => void clearChatMemory()} disabled={chatLoading}>清空记录</button>
                  <button onClick={scrollChatToLatest} disabled={chatLoading}>跳到最新</button>
                </div>
                <div className="row">
                  <label className="meta-nowrap">
                    <input
                      type="checkbox"
                      checked={useNewsContext}
                      onChange={(e) => setUseNewsContext(e.target.checked)}
                    />
                    基于新闻上下文
                  </label>
                </div>
                <div className="row">
                  <select value={chatMode} onChange={(e) => setChatMode(e.target.value as "filtered" | "all" | "selected") }>
                    <option value="filtered">基于当前筛选</option>
                    <option value="all">基于全库新闻(按上限抽取)</option>
                    <option value="selected">基于勾选新闻</option>
                  </select>
                  <select value={chatLimit} onChange={(e) => setChatLimit(Number(e.target.value))}>
                    <option value={8}>快速(8条)</option>
                    <option value={12}>标准(12条)</option>
                    <option value={20}>深入(20条)</option>
                    <option value={30}>全面(30条)</option>
                    <option value={50}>大量(50条, 分批综合)</option>
                    <option value={80}>超大(80条, 分批综合)</option>
                  </select>
                </div>
              </div>

              <div className="llm-notes">
                <div className="meta-line">说明: 全库模式会从数据库按最新排序抽取最多N条，不是无上限读取全部。</div>
                <div className="meta-line">当前筛选模式会应用关键词、来源、地区这三类筛选条件。</div>
                <div className="meta-line">当条数大于20时，后端自动分批分析并做综合汇总。</div>
                <div className="meta-line">可拖拽输入框上方边框手动调节高度。</div>
                <div className="meta-line">已勾选新闻: {selectedNewsIds.length}</div>
              </div>
            </div>

            <div className="llm-middle-scroll">
              {chatHistory.length > renderedChatHistory.length && (
                <div className="chat-trim-hint">为保证流畅，仅渲染最近 {renderedChatHistory.length} 条对话。</div>
              )}
              <div ref={chatBoxRef} className="chat-box" onScroll={updateChatBottomState}>
                {renderedChatHistory.map((item, idx) => (
                  <div key={`${item.role}-${idx}`} className={`chat-row ${item.role}`}>
                    <div className={`chat-bubble ${item.role}`}>
                      <div className={`chat-author ${item.role}`}>{item.role === "user" ? "你" : "LLM"}</div>
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
                <button className="chat-latest-fab" onClick={scrollChatToLatest} title="跳到最新">
                  跳到最新
                </button>
              )}
            </div>

            <div className="llm-bottom-fixed">
              <div className="chat-input-resizer" onMouseDown={startResizeChatInput} title="向上拖拽可增大输入框" />
              <textarea
                ref={chatInputRef}
                className="chat-input"
                onKeyDown={onChatInputKeyDown}
                placeholder="例如：总结今天欧洲和中东政治风险，并给出市场影响。"
                rows={5}
                style={{ height: `${chatInputHeight}px` }}
              />
              <button onClick={onChat} disabled={chatLoading}>
                {chatLoading ? "分析中..." : "发送给LLM"}
              </button>
            </div>
          </aside>
        </div>
      </section>

    </div>
  );
}
