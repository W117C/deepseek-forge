/**
 * @agenthub/dsh-client-ui-research —— 学术研究员文献看板（浏览器半部）。
 * 真实 store 接入：defineStore 定义文献看板 store，会话 mcp-papers 检索/引用核验
 * 结果经 actions（applyLiterature / applyCitationChecks）写入，面板订阅渲染。
 */
window.__ModuleLoader__.load({
  id: "@agenthub/dsh-client-ui-research",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react = require("react");
    let jsxRuntime = require("react/jsx-runtime");
    let runtimeClient = require("@deepseek-ai/dsh-client-runtime/client");

    // 看板 store：文献追踪 + 引用核验（会话检索工具写入，持久化）
    var researchStore = runtimeClient.defineStore({
      init: () => ({
        papers: [],     // [{ title, source, year, url }]
        citations: [],  // [{ claim, source, verified: "yes"|"no"|"pending", note }]
        updatedAt: null,
      }),
      actions: {
        applyLiterature(draft, papers) {
          if (Array.isArray(papers)) draft.papers = papers;
          draft.updatedAt = new Date().toISOString();
        },
        applyCitationChecks(draft, citations) {
          if (Array.isArray(citations)) draft.citations = citations;
        },
      },
      persist: "dsh.agenthub.research.v1",
    });

    var handle = researchStore.create();

    /** 文献追踪列表（订阅 store）。 */
    function LiteratureList() {
      var snap = handle.getSnapshot();
      var papers = snap.papers || [];
      return react.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 4 } },
        react.createElement("div", { style: { fontSize: 12, fontWeight: 600 } }, "文献追踪"),
        papers.length === 0
          ? react.createElement("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" } },
              "（会话检索文献后显示：标题 / 来源 / 年份）")
          : papers.map(function (p, i) {
              return react.createElement(
                "div",
                { key: i, style: { fontSize: 12, display: "flex", gap: 6 } },
                react.createElement("span", { style: { color: "var(--muted, #8b919c)" } }, String(p.year || "")),
                react.createElement("span", {}, String(p.title || "")),
                p.source ? react.createElement("span", { style: { color: "var(--accent, #58a6ff)", fontSize: 11 } }, String(p.source)) : null
              );
            })
      );
    }

    /** 引用核验状态（订阅 store）。 */
    function CitationCheck() {
      var snap = handle.getSnapshot();
      var citations = snap.citations || [];
      var color = { yes: "#3fb950", no: "#f85149", pending: "#d9a83b" };
      var label = { yes: "已核验", no: "存疑", pending: "待核验" };
      return react.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 4 } },
        react.createElement("div", { style: { fontSize: 12, fontWeight: 600 } }, "引用核验"),
        citations.length === 0
          ? react.createElement("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" } },
              "（会话核验引文后显示：来源 / 可验证性）")
          : citations.map(function (c, i) {
              return react.createElement(
                "div",
                { key: i, style: { fontSize: 12, display: "flex", gap: 6 } },
                react.createElement("span", { style: { color: String(color[c.verified] || "#d9a83b") } },
                  String(label[c.verified] || c.verified || "")),
                react.createElement("span", {}, String(c.claim || ""))
              );
            })
      );
    }

    /** 面板主体：学术文献看板（订阅 store 变化触发重渲染）。 */
    function ResearchPanel() {
      var useSyncExternalStore = react.useSyncExternalStore;
      useSyncExternalStore(
        function (fn) { return handle.subscribe(fn); },
        function () { return handle.getSnapshot(); }
      );
      return react.createElement(
        "div",
        { style: { padding: 12, display: "flex", flexDirection: "column", gap: 10 } },
        react.createElement("div", { style: { fontWeight: 600, fontSize: 13 } }, "学术研究看板"),
        react.createElement(LiteratureList, {}),
        react.createElement(CitationCheck, {}),
        react.createElement("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" } },
          "论文数据由 profile 的 mcp-papers 数据源提供；综述/报告入口见会话工具。")
      );
    }

    exports.ResearchPanel = ResearchPanel;
    exports.researchStore = researchStore; // 供会话 mcp-papers 检索写入
    exports.default = ResearchPanel;
    module.exports = exports;
    return module.exports;
  },
});
