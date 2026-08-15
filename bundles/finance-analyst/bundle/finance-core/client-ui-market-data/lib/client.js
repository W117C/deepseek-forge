/**
 * @agenthub/dsh-client-ui-market-data —— 金融分析师市场数据看板（浏览器半部）。
 * 经 window.__ModuleLoader__.load 注册，挂载为 DSH Web 的面板。
 * 最小可用版：行情卡片（占位数据源）+ 数据源 provider 状态 + 定时简报入口。
 * 真实行情数据由 profile 的 mcp-market-data 数据源（local-mcp / tushare）提供。
 */
window.__ModuleLoader__.load({
  id: "@agenthub/dsh-client-ui-market-data",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react = require("react");
    let jsxRuntime = require("react/jsx-runtime");

    /** 面板主体：市场数据看板卡片（行情占位 + 数据源状态 + 简报入口）。 */
    function MarketDataPanel() {
      var useState = react.useState;
      var providers = [
        { id: "local-mcp", label: "本地自建 MCP", status: "ready", note: "http://localhost:3111/mcp" },
        { id: "tushare", label: "Tushare", status: "setup", note: "需配置鉴权头" },
      ];
      return jsxRuntime.jsxs("div", {
        style: { padding: 12, display: "flex", flexDirection: "column", gap: 10 },
        children: [
          jsxRuntime.jsx("div", {
            style: { fontWeight: 600, fontSize: 13 },
            children: "市场数据看板",
          }),
          jsxRuntime.jsx("div", {
            style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
            children: providers.map(function (p) {
              return jsxRuntime.jsx("div", {
                style: {
                  border: "1px solid var(--border, #2a2d33)",
                  borderRadius: 8,
                  padding: 8,
                },
                children: jsxRuntime.jsxs("div", {
                  children: [
                    jsxRuntime.jsx("div", { style: { fontSize: 12, fontWeight: 500 }, children: p.label }),
                    jsxRuntime.jsx("div", {
                      style: { fontSize: 11, color: p.status === "ready" ? "#3fb950" : "#d9a83b" },
                      children: p.status === "ready" ? "✓ 就绪" : "⚠ " + p.note,
                    }),
                  ],
                }),
              }, p.id);
            }),
          }),
          jsxRuntime.jsx("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" }, children: "行情与研报由 profile 数据源提供；查看 / 定时简报入口见会话工具。" }),
        ],
      });
    }

    exports.MarketDataPanel = MarketDataPanel;
    exports.default = MarketDataPanel;
    module.exports = exports;
    return module.exports;
  },
});
