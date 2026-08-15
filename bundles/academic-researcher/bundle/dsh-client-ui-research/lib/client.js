/**
 * @agenthub/dsh-client-ui-research —— 学术研究员文献看板（浏览器半部）。
 * 经 window.__ModuleLoader__.load 注册，挂载为 DSH Web 的面板。
 * 看板三块：文献追踪（追踪列表）、引用核验（状态）、报告入口（综述/报告生成）。
 * 数据来自会话 mcp-papers 数据源与文献工具；最小可用版展示骨架与状态说明。
 */
window.__ModuleLoader__.load({
  id: "@agenthub/dsh-client-ui-research",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react = require("react");
    let jsxRuntime = require("react/jsx-runtime");

    /** 文献追踪列表（占位；会话文献检索结果写入后渲染）。 */
    function LiteratureList() {
      var items = [];
      return jsxRuntime.jsxs("div", {
        style: { display: "flex", flexDirection: "column", gap: 4 },
        children: [
          jsxRuntime.jsx("div", { style: { fontSize: 12, fontWeight: 600 }, children: "文献追踪" }),
          items.length === 0
            ? jsxRuntime.jsx("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" }, children: "（会话中检索文献后显示：标题 / 来源 / 时间）" })
            : items.map(function (it, i) {
                return jsxRuntime.jsx("div", { style: { fontSize: 12 }, children: it }, i);
              }),
        ],
      });
    }

    /** 引用核验状态（占位；引文核验工具结果写入后渲染）。 */
    function CitationCheck() {
      return jsxRuntime.jsxs("div", {
        style: { display: "flex", flexDirection: "column", gap: 4 },
        children: [
          jsxRuntime.jsx("div", { style: { fontSize: 12, fontWeight: 600 }, children: "引用核验" }),
          jsxRuntime.jsx("div", {
            style: { fontSize: 11, color: "var(--muted, #8b919c)" },
            children: "（会话中核验引文后显示：来源 / 可验证性）",
          }),
        ],
      });
    }

    /** 面板主体：学术文献看板（追踪 + 引用核验）。 */
    function ResearchPanel() {
      return jsxRuntime.jsxs("div", {
        style: { padding: 12, display: "flex", flexDirection: "column", gap: 10 },
        children: [
          jsxRuntime.jsx("div", { style: { fontWeight: 600, fontSize: 13 }, children: "学术研究看板" }),
          jsxRuntime.jsx(LiteratureList, {}),
          jsxRuntime.jsx(CitationCheck, {}),
          jsxRuntime.jsx("div", {
            style: { fontSize: 11, color: "var(--muted, #8b919c)" },
            children: "论文数据由 profile 的 mcp-papers 数据源提供；综述/报告入口见会话工具。",
          }),
        ],
      });
    }

    exports.ResearchPanel = ResearchPanel;
    exports.default = ResearchPanel;
    module.exports = exports;
    return module.exports;
  },
});
