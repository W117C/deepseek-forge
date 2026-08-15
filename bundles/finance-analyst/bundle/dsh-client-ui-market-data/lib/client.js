/**
 * @agenthub/dsh-client-ui-market-data —— 金融分析师市场数据看板（浏览器半部）。
 * 真实 store 接入：defineStore 定义看板 store，会话 MCP/数据源结果经 actions
 * （applyProviderStatus / applyMarketData）写入，面板订阅渲染。
 */
window.__ModuleLoader__.load({
  id: "@agenthub/dsh-client-ui-market-data",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react = require("react");
    let jsxRuntime = require("react/jsx-runtime");
    let runtimeClient = require("@deepseek-ai/dsh-client-runtime/client");

    // 看板 store：数据源 provider 状态 + 行情数据 + 简报入口（会话写入，持久化）
    var marketStore = runtimeClient.defineStore({
      init: () => ({
        providers: [],   // [{ id, label, status: "ready"|"setup"|"error", note }]
        quotes: [],      // [{ symbol, price, change, changePct }]
        updatedAt: null,
      }),
      actions: {
        applyProviderStatus(draft, providers) {
          if (Array.isArray(providers)) draft.providers = providers;
        },
        applyMarketData(draft, quotes) {
          if (Array.isArray(quotes)) draft.quotes = quotes;
          draft.updatedAt = new Date().toISOString();
        },
      },
      persist: "dsh.agenthub.marketData.v1",
    });

    var handle = marketStore.create();

    /** Provider 状态（订阅 store）。 */
    function Providers() {
      var snap = handle.getSnapshot();
      var providers = snap.providers || [
        { id: "local-mcp", label: "本地自建 MCP", status: "ready", note: "http://localhost:3111/mcp" },
        { id: "tushare", label: "Tushare", status: "setup", note: "需配置鉴权头" },
      ];
      return react.createElement(
        "div",
        { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } },
        providers.map(function (p) {
          return react.createElement(
            "div",
            { key: p.id, style: { border: "1px solid var(--border, #2a2d33)", borderRadius: 8, padding: 8 } },
            react.createElement("div", { style: { fontSize: 12, fontWeight: 500 } }, String(p.label || p.id)),
            react.createElement("div", { style: { fontSize: 11, color: p.status === "ready" ? "#3fb950" : "#d9a83b" } },
              p.status === "ready" ? "✓ 就绪" : "⚠ " + String(p.note || ""))
          );
        })
      );
    }

    /** 行情速览（订阅 store；会话 MCP 写入后显示）。 */
    function Quotes() {
      var snap = handle.getSnapshot();
      var quotes = snap.quotes || [];
      if (quotes.length === 0) {
        return react.createElement("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" } },
          "（会话行情工具写入后显示：代码 / 价格 / 涨跌）");
      }
      return react.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 4 } },
        quotes.map(function (q, i) {
          return react.createElement(
            "div",
            { key: i, style: { fontSize: 12, fontFamily: "var(--font-mono, monospace)", display: "flex", gap: 8, justifyContent: "space-between" } },
            react.createElement("span", {}, String(q.symbol)),
            react.createElement("span", {}, String(q.price)),
            react.createElement("span", { style: { color: Number(q.change) >= 0 ? "#3fb950" : "#f85149" } },
              String(q.changePct != null ? q.changePct + "%" : ""))
          );
        })
      );
    }

    /** 面板主体：市场数据看板（订阅 store 变化触发重渲染）。 */
    function MarketDataPanel() {
      var useSyncExternalStore = react.useSyncExternalStore;
      useSyncExternalStore(
        function (fn) { return handle.subscribe(fn); },
        function () { return handle.getSnapshot(); }
      );
      return react.createElement(
        "div",
        { style: { padding: 12, display: "flex", flexDirection: "column", gap: 10 } },
        react.createElement("div", { style: { fontWeight: 600, fontSize: 13 } }, "市场数据看板"),
        react.createElement(Providers, {}),
        react.createElement(Quotes, {}),
        react.createElement("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" } },
          "行情与研报由 profile 数据源提供；查看 / 定时简报入口见会话工具。")
      );
    }

    exports.MarketDataPanel = MarketDataPanel;
    exports.marketStore = marketStore; // 供会话 MCP/数据源写入
    exports.default = MarketDataPanel;
    module.exports = exports;
    return module.exports;
  },
});
