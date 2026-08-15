/**
 * @agenthub/dsh-client-ui-data-viz —— 数据分析师可视化看板（浏览器半部）。
 * 真实 store 接入：defineStore 定义看板 store，会话分析结果经 actions
 * （applyDataset / applySteps）写入，面板订阅渲染数据集摘要、分析步骤。
 */
window.__ModuleLoader__.load({
  id: "@agenthub/dsh-client-ui-data-viz",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react = require("react");
    let jsxRuntime = require("react/jsx-runtime");
    let runtimeClient = require("@deepseek-ai/dsh-client-runtime/client");

    // 看板 store：数据集摘要 + 分析步骤（会话分析工具写入，持久化）
    var vizStore = runtimeClient.defineStore({
      init: () => ({
        dataset: null,   // { name, rows, columns }
        steps: [],       // [{ step, detail }]
        updatedAt: null,
      }),
      actions: {
        applyDataset(draft, dataset) {
          if (dataset && typeof dataset === "object") draft.dataset = dataset;
        },
        applySteps(draft, steps) {
          if (Array.isArray(steps)) draft.steps = steps;
          draft.updatedAt = new Date().toISOString();
        },
      },
      persist: "dsh.agenthub.dataViz.v1",
    });

    var handle = vizStore.create();

    /** 数据集摘要（订阅 store）。 */
    function DatasetSummary() {
      var snap = handle.getSnapshot();
      var d = snap.dataset;
      return react.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 4 } },
        react.createElement("div", { style: { fontSize: 12, fontWeight: 600 } }, "数据集"),
        d
          ? react.createElement("div", { style: { fontSize: 12, fontFamily: "var(--font-mono, monospace)" } },
              String(d.name || "—") + " · " + String(d.rows ?? "?") + " 行 · " + String(d.columns ?? "?") + " 列")
          : react.createElement("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" } },
              "（会话加载数据后显示：名称 / 行数 / 列数）")
      );
    }

    /** 分析步骤（订阅 store）。 */
    function AnalysisSteps() {
      var snap = handle.getSnapshot();
      var steps = snap.steps || [];
      return react.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 4 } },
        react.createElement("div", { style: { fontSize: 12, fontWeight: 600 } }, "分析步骤"),
        steps.length === 0
          ? react.createElement("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" } },
              "（会话分析过程写入后显示：清洗 / 统计 / 可视化）")
          : steps.map(function (s, i) {
              return react.createElement(
                "div",
                { key: i, style: { fontSize: 12, display: "flex", gap: 6 } },
                react.createElement("span", { style: { color: "var(--accent, #58a6ff)" } }, String(i + 1) + "."),
                react.createElement("span", {}, String(s.step || "")),
                s.detail ? react.createElement("span", { style: { fontSize: 11, color: "var(--muted, #8b919c)" } }, String(s.detail)) : null
              );
            })
      );
    }

    /** 面板主体：数据分析看板（订阅 store 变化触发重渲染）。 */
    function DataVizPanel() {
      var useSyncExternalStore = react.useSyncExternalStore;
      useSyncExternalStore(
        function (fn) { return handle.subscribe(fn); },
        function () { return handle.getSnapshot(); }
      );
      return react.createElement(
        "div",
        { style: { padding: 12, display: "flex", flexDirection: "column", gap: 10 } },
        react.createElement("div", { style: { fontWeight: 600, fontSize: 13 } }, "数据分析看板"),
        react.createElement(DatasetSummary, {}),
        react.createElement(AnalysisSteps, {}),
        react.createElement("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" } },
          "图表与结论由会话分析工具写入；分析过程遵循数据来源与口径标注。")
      );
    }

    exports.DataVizPanel = DataVizPanel;
    exports.vizStore = vizStore; // 供会话分析工具写入
    exports.default = DataVizPanel;
    module.exports = exports;
    return module.exports;
  },
});
