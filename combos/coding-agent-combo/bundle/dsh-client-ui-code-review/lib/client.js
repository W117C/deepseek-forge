/**
 * @agenthub/dsh-client-ui-code-review —— 编码 Agent diff/工作区看板（浏览器半部）。
 * 真实 store 接入：经 defineStore 定义看板 store（init + actions），
 * 会话 git 工具把结果经 actions 写入（applyGitOutput / applyWorktree），
 * 面板组件订阅 store（subscribe/getSnapshot）实时渲染 diff 统计、变更文件、worktree。
 */
window.__ModuleLoader__.load({
  id: "@agenthub/dsh-client-ui-code-review",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    let react = require("react");
    let jsxRuntime = require("react/jsx-runtime");
    let runtimeClient = require("@deepseek-ai/dsh-client-runtime/client");

    // 看板 store：diff 统计 + 变更文件 + worktree（会话 git 工具写入，持久化到 localStorage）
    var reviewStore = runtimeClient.defineStore({
      init: () => ({
        branch: null,
        changedFiles: 0,
        additions: 0,
        deletions: 0,
        files: [],          // [{ path, status: "M"|"A"|"D"|"??" }]
        worktree: [],       // git status --short 原文行
        updatedAt: null,
      }),
      actions: {
        applyGitOutput(draft, parsed) {
          if (!parsed || typeof parsed !== "object") return;
          draft.changedFiles = Number(parsed.changedFiles) || 0;
          draft.additions = Number(parsed.additions) || 0;
          draft.deletions = Number(parsed.deletions) || 0;
          if (Array.isArray(parsed.files)) draft.files = parsed.files;
          if (typeof parsed.branch === "string") draft.branch = parsed.branch;
          draft.updatedAt = new Date().toISOString();
        },
        applyWorktree(draft, lines) {
          if (Array.isArray(lines)) draft.worktree = lines;
        },
      },
      persist: "dsh.agenthub.codeReview.v1",
    });

    var handle = reviewStore.create();

    /** Diff 统计卡片（订阅 store 实时更新）。 */
    function DiffStats() {
      var snap = handle.getSnapshot();
      var stats = [
        { label: "变更文件", value: snap.changedFiles },
        { label: "新增 +", value: snap.additions },
        { label: "删除 −", value: snap.deletions },
      ];
      return react.createElement(
        "div",
        { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 } },
        stats.map(function (s) {
          return react.createElement(
            "div",
            { key: s.label, style: { border: "1px solid var(--border, #2a2d33)", borderRadius: 8, padding: "8px 10px", textAlign: "center" } },
            react.createElement("div", { style: { fontSize: 16, fontWeight: 700, color: "var(--accent, #58a6ff)" } }, String(s.value)),
            react.createElement("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" } }, s.label)
          );
        })
      );
    }

    /** 变更文件列表（订阅 store）。 */
    function ChangedFiles() {
      var snap = handle.getSnapshot();
      var files = snap.files || [];
      return react.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 4 } },
        react.createElement("div", { style: { fontSize: 12, fontWeight: 600 } }, "变更文件"),
        files.length === 0
          ? react.createElement("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" } }, "（会话 git diff 后写入）")
          : files.map(function (f, i) {
              var statusMap = { M: "改", A: "新", D: "删", "??": "未" };
              return react.createElement(
                "div",
                { key: i, style: { fontSize: 12, fontFamily: "var(--font-mono, monospace)", display: "flex", gap: 6 } },
                react.createElement("span", { style: { color: "var(--accent, #58a6ff)" } }, String(statusMap[f.status] || f.status || "·")),
                react.createElement("span", {}, String(f.path))
              );
            })
      );
    }

    /** Worktree 状态（订阅 store）。 */
    function Worktree() {
      var snap = handle.getSnapshot();
      var lines = snap.worktree || [];
      return react.createElement(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 4 } },
        react.createElement("div", { style: { fontSize: 12, fontWeight: 600 } }, "Worktree" + (snap.branch ? " · " + snap.branch : "")),
        lines.length === 0
          ? react.createElement("div", { style: { fontSize: 11, color: "var(--muted, #8b919c)" } }, "（git status --short 结果写入后显示）")
          : lines.slice(0, 12).map(function (l, i) {
              return react.createElement("div", { key: i, style: { fontSize: 11, fontFamily: "var(--font-mono, monospace)" } }, String(l));
            })
      );
    }

    /** 面板主体：订阅 store 变化触发重渲染。 */
    function CodeReviewPanel() {
      var useSyncExternalStore = react.useSyncExternalStore;
      useSyncExternalStore(
        function (fn) { return handle.subscribe(fn); },
        function () { return handle.getSnapshot(); }
      );
      return react.createElement(
        "div",
        { style: { padding: 12, display: "flex", flexDirection: "column", gap: 10 } },
        react.createElement("div", { style: { fontWeight: 600, fontSize: 13 } }, "编码工作区看板"),
        react.createElement(DiffStats, {}),
        react.createElement(ChangedFiles, {}),
        react.createElement(Worktree, {})
      );
    }

    /**
     * 界面注册：安装后把看板注入 DSH Web 原有界面（侧边栏 workspaces hole）。
     * 卸载时 bundle 移除，slots 随之注销——插件看板只随安装出现。
     */
    function apply(ctx) {
      ctx.slots.inject("sidebar.workspaces", () =>
        ctx.slots.register({
          name: "sidebar.workspaces",
          store: handle,
          inject: () => ({ branch: handle.getSnapshot().branch || null }),
        }, CodeReviewPanel)
      );
    }

    exports.CodeReviewPanel = CodeReviewPanel;
    exports.reviewStore = reviewStore; // 供会话工具/其他面板写入
    exports.apply = apply;
    exports.default = CodeReviewPanel;
    module.exports = exports;
    return module.exports;
  },
});
