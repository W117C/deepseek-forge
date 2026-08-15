// DeepSeek Forge — curated Recipe catalog (能力组合模板).
// Recipes are NOT packages: they are Forge-curated compositions that reference
// REAL registry components by id (first available id wins per slot). A slot
// with no curated component yet stays honestly empty and points at GitHub
// Import — the loop closes: GitHub → Component → Recipe → Agent.
export interface RecipeSlot {
  /** Human role of this slot in the stack (zh/en). */
  role: { zh: string; en: string };
  /** Candidate real registry ids; first one present in the registry wins. */
  ids: string[];
}

export interface Recipe {
  id: string;
  name: { zh: string; en: string };
  tagline: { zh: string; en: string };
  description: { zh: string; en: string };
  /** Pipeline steps, input → … → output (zh/en). */
  flow: { zh: string; en: string }[];
  category: { zh: string; en: string };
  slots: RecipeSlot[];
  /** Open the Composer instead of installing a fixed bundle. */
  composerOnly?: boolean;
  /** Capabilities the assembled agent exposes (zh/en), shown on the card. */
  capabilities?: { zh: string; en: string }[];
}

export const RECIPES: Recipe[] = [
  {
    id: "deep-research",
    name: { zh: "深度研究 Agent", en: "Deep Research Agent" },
    tagline: { zh: "输入一个研究问题，输出研究报告", en: "One research question in, a cited report out" },
    description: {
      zh: "搜索网页 → 浏览资料 → 阅读论文 → 提取引用 → 生成 Research Report。用户最容易理解的第一批组合。",
      en: "Search the web → browse sources → read papers → extract citations → produce a research report.",
    },
    flow: [
      { zh: "研究问题", en: "Research question" },
      { zh: "搜索网页", en: "Web search" },
      { zh: "浏览资料", en: "Browse sources" },
      { zh: "阅读论文", en: "Read papers" },
      { zh: "提取引用", en: "Extract citations" },
      { zh: "研究报告", en: "Research report" },
    ],
    category: { zh: "研究", en: "Research" },
    capabilities: [
      { zh: "网页研究", en: "Web research" },
      { zh: "论文阅读", en: "Paper reading" },
      { zh: "引文核验", en: "Citation verification" },
    ],
    slots: [
      { role: { zh: "网页搜索", en: "Web Search" }, ids: ["modsearch", "argo"] },
      { role: { zh: "浏览器", en: "Browser" }, ids: ["browser-bridge", "dsh-browser"] },
      { role: { zh: "论文阅读", en: "PDF Reader" }, ids: ["claude-paper"] },
      { role: { zh: "引用管理", en: "Citation" }, ids: ["academic-researcher"] },
      { role: { zh: "文档输出", en: "Document Writer" }, ids: [] },
    ],
  },
  {
    id: "coding-agent",
    name: { zh: "编程 Agent", en: "Coding Agent" },
    tagline: { zh: "读仓库 → 改代码 → 跑测试 → 提交", en: "Read a repo, change code, run tests, commit" },
    description: {
      zh: "GitHub 仓库 → 读取代码 → 搜索符号 → 修改文件 → 运行测试 → 浏览器验证 → 提交代码。",
      en: "GitHub repo → read code → search symbols → edit files → run tests → verify in browser → commit.",
    },
    flow: [
      { zh: "GitHub 仓库", en: "GitHub repo" },
      { zh: "读取代码", en: "Read code" },
      { zh: "搜索符号", en: "Search symbols" },
      { zh: "修改文件", en: "Edit files" },
      { zh: "运行测试", en: "Run tests" },
      { zh: "提交代码", en: "Commit" },
    ],
    category: { zh: "编程", en: "Coding" },
    capabilities: [
      { zh: "代码理解", en: "Code understanding" },
      { zh: "沙箱执行", en: "Sandboxed execution" },
      { zh: "工作区文件", en: "Workspace files" },
    ],
    slots: [
      { role: { zh: "GitHub", en: "GitHub" }, ids: ["coding-tools-mcp"] },
      { role: { zh: "文件系统", en: "Filesystem" }, ids: ["dsh-at-file", "axern"] },
      { role: { zh: "终端/沙箱", en: "Terminal" }, ids: ["axern", "dsh-better-sidebar"] },
      { role: { zh: "浏览器验证", en: "Browser" }, ids: ["dsh-browser", "browser-bridge"] },
      { role: { zh: "代码搜索", en: "Code Search" }, ids: ["leantoken"] },
    ],
  },
  {
    id: "academic-agent",
    name: { zh: "全自动论文 Agent", en: "Academic Agent" },
    tagline: { zh: "“帮我完成一篇关于 XXX 的 Research Report”", en: "“Write me a research report on XXX”" },
    description: {
      zh: "搜索 + 浏览器 + 论文 + 引用管理 + 数据分析 + 文档。Forge 提供完整能力栈，适合学术作业生产线。",
      en: "Search + browser + papers + citation + data analysis + document. Forge supplies the whole stack.",
    },
    flow: [
      { zh: "研究主题", en: "Topic" },
      { zh: "学术搜索", en: "Academic search" },
      { zh: "论文精读", en: "Read papers" },
      { zh: "引用管理", en: "Citation manager" },
      { zh: "数据分析", en: "Data analysis" },
      { zh: "论文成稿", en: "Paper draft" },
    ],
    category: { zh: "学术", en: "Academic" },
    capabilities: [
      { zh: "学术检索", en: "Academic search" },
      { zh: "引文核验", en: "Citation verification" },
      { zh: "数据分析", en: "Data analysis" },
    ],
    slots: [
      { role: { zh: "学术搜索", en: "Search" }, ids: ["argo", "modsearch"] },
      { role: { zh: "浏览器", en: "Browser" }, ids: ["browser-bridge"] },
      { role: { zh: "PDF 阅读", en: "PDF" }, ids: ["claude-paper"] },
      { role: { zh: "引用管理", en: "Citation Manager" }, ids: ["academic-researcher"] },
      { role: { zh: "数据分析", en: "Data Analysis" }, ids: ["dsh-toolkit", "mcp-for-stata"] },
      { role: { zh: "文档输出", en: "Document" }, ids: [] },
    ],
  },
  {
    id: "data-analyst",
    name: { zh: "数据分析 Agent", en: "Data Analyst" },
    tagline: { zh: "上传表格 → 清洗 → 统计 → 画图 → 报告", en: "Upload a sheet, get a clean report with charts" },
    description: {
      zh: "上传 Excel/CSV → 分析数据 → 清洗 → 统计 → 可视化 → 生成报告。最适合做成“一键安装”模板。",
      en: "Upload Excel/CSV → analyze → clean → statistics → visualize → report. The classic one-click template.",
    },
    flow: [
      { zh: "Excel/CSV", en: "Excel/CSV" },
      { zh: "读取文件", en: "Read files" },
      { zh: "Python 分析", en: "Python analysis" },
      { zh: "清洗统计", en: "Clean & stats" },
      { zh: "可视化", en: "Visualization" },
      { zh: "分析报告", en: "Report" },
    ],
    category: { zh: "数据", en: "Data" },
    capabilities: [
      { zh: "表格处理", en: "Tabular data" },
      { zh: "沙箱执行", en: "Sandboxed Python" },
      { zh: "生成式图表", en: "Generated charts" },
    ],
    slots: [
      { role: { zh: "文件读取", en: "File Reader" }, ids: ["dsh-at-file"] },
      { role: { zh: "Python 沙箱", en: "Python" }, ids: ["axern"] },
      { role: { zh: "数据工具", en: "Pandas/Analysis" }, ids: ["dsh-toolkit", "mcp-for-stata"] },
      { role: { zh: "可视化", en: "Visualization" }, ids: ["dsh-visualize", "archify"] },
      { role: { zh: "报告生成", en: "Report Generator" }, ids: [] },
    ],
  },
  {
    id: "investment-research",
    name: { zh: "金融研究 Agent", en: "Investment Research Agent" },
    tagline: { zh: "“分析 NVIDIA 最近一个季度的基本面”", en: "“Analyze NVIDIA’s latest quarter”" },
    description: {
      zh: "市场数据 → 财报 → 新闻 → 估值 → 历史数据 → 风险 → Research Report。与普通 Agent 市场的差异最明显。",
      en: "Market data → filings → news → valuation → history → risk → research report.",
    },
    flow: [
      { zh: "公司/标的", en: "Ticker" },
      { zh: "市场数据", en: "Market data" },
      { zh: "财报检索", en: "Filings" },
      { zh: "新闻舆情", en: "News" },
      { zh: "估值分析", en: "Valuation" },
      { zh: "研究报告", en: "Report" },
    ],
    category: { zh: "金融", en: "Finance" },
    capabilities: [
      { zh: "金融搜索", en: "Financial search" },
      { zh: "投研决策", en: "Investment analysis" },
      { zh: "图表输出", en: "Charts" },
    ],
    slots: [
      { role: { zh: "市场数据", en: "Market Data" }, ids: ["argo"] },
      { role: { zh: "金融分析", en: "Financial Analysis" }, ids: ["finance-analyst"] },
      { role: { zh: "财报/监管文件", en: "SEC / Filings" }, ids: [] },
      { role: { zh: "图表", en: "Chart" }, ids: ["dsh-visualize"] },
      { role: { zh: "报告", en: "Report" }, ids: [] },
    ],
  },
  {
    id: "content-creator",
    name: { zh: "内容生产 Agent", en: "Content Creator" },
    tagline: { zh: "“帮我做一期关于 AI Agent 的内容”", en: "“Make me a content piece about AI agents”" },
    description: {
      zh: "Research → 大纲 → 写作 → 配图提示 → 成稿。覆盖小红书/B站/公众号等平台的内容发现与素材链路。",
      en: "Research → outline → writing → image prompts → final content, for Xiaohongshu/Bilibili/WeChat channels.",
    },
    flow: [
      { zh: "选题", en: "Topic" },
      { zh: "趋势研究", en: "Trend research" },
      { zh: "写作大纲", en: "Outline" },
      { zh: "配图/上传", en: "Images" },
      { zh: "最终成稿", en: "Final content" },
    ],
    category: { zh: "内容", en: "Content" },
    capabilities: [
      { zh: "趋势发现", en: "Trend discovery" },
      { zh: "图片上传", en: "Image pipeline" },
      { zh: "多平台内容", en: "Multi-platform" },
    ],
    slots: [
      { role: { zh: "趋势研究", en: "Trend Research" }, ids: ["openbiliclaw"] },
      { role: { zh: "网页搜索", en: "Web Search" }, ids: ["modsearch"] },
      { role: { zh: "图片", en: "Image" }, ids: ["picgo-core", "agent-vision-toolkit"] },
      { role: { zh: "写作", en: "Writing" }, ids: [] },
      { role: { zh: "文档输出", en: "Document" }, ids: ["notes"] },
    ],
  },
  {
    id: "github-analyzer",
    name: { zh: "GitHub 项目分析 Agent", en: "GitHub Analyzer" },
    tagline: { zh: "输入 repo 地址 → 分析报告 → 可转化为 Forge 包", en: "A repo URL in, an analysis report out — then a Forge package" },
    description: {
      zh: "Clone → 分析 → 架构识别 → 依赖 → 安全扫描 → 能力清单 → 报告。最终可以 Analyze → Convert to Forge Package：Forge 的“自举”闭环。",
      en: "Clone → analyze → architecture → dependencies → security scan → capabilities → report. The loop closes when the report becomes a Forge package.",
    },
    flow: [
      { zh: "github.com/xxx", en: "github.com/xxx" },
      { zh: "Clone", en: "Clone" },
      { zh: "架构识别", en: "Architecture" },
      { zh: "依赖分析", en: "Dependencies" },
      { zh: "安全扫描", en: "Security scan" },
      { zh: "能力清单", en: "Capabilities" },
      { zh: "Forge 包", en: "Forge package" },
    ],
    category: { zh: "工程", en: "Engineering" },
    capabilities: [
      { zh: "逆向分析", en: "Reverse analysis" },
      { zh: "代码智能", en: "Code intelligence" },
      { zh: "安全门禁", en: "Security gating" },
    ],
    slots: [
      { role: { zh: "GitHub", en: "GitHub" }, ids: ["coding-tools-mcp"] },
      { role: { zh: "代码搜索", en: "Code Search" }, ids: ["leantoken"] },
      { role: { zh: "架构识别", en: "Architecture" }, ids: ["rea", "promentor"] },
      { role: { zh: "安全扫描", en: "Security Scanner" }, ids: ["openguardrails", "anchorlaw"] },
      { role: { zh: "文档", en: "Documentation" }, ids: ["dsh-handbook"] },
      { role: { zh: "报告生成", en: "Report Generator" }, ids: [] },
    ],
  },
  {
    id: "browser-research",
    name: { zh: "浏览器调研 Agent", en: "Browser Research Agent" },
    tagline: { zh: "“帮我找出 20 个符合条件的产品”", en: "“Find me 20 matching products”" },
    description: {
      zh: "搜索 → 打开页面 → 提取数据 → 过滤 → 对比 → 导出 CSV。浏览器驱动的批量调研。",
      en: "Search → open pages → extract → filter → compare → export CSV. Browser-driven research at scale.",
    },
    flow: [
      { zh: "调研任务", en: "Task" },
      { zh: "搜索", en: "Search" },
      { zh: "打开页面", en: "Open pages" },
      { zh: "提取数据", en: "Extract" },
      { zh: "对比导出", en: "Compare & export" },
    ],
    category: { zh: "调研", en: "Research" },
    capabilities: [
      { zh: "浏览器自动化", en: "Browser automation" },
      { zh: "网页搜索", en: "Web search" },
      { zh: "截图 OCR", en: "Screenshot OCR" },
    ],
    slots: [
      { role: { zh: "浏览器", en: "Browser" }, ids: ["browser-bridge", "dsh-browser"] },
      { role: { zh: "搜索", en: "Search" }, ids: ["modsearch"] },
      { role: { zh: "提取", en: "Extract" }, ids: [] },
      { role: { zh: "截图", en: "Screenshot" }, ids: ["agent-vision-toolkit"] },
      { role: { zh: "文档导出", en: "Document" }, ids: ["notes"] },
    ],
  },
  {
    id: "ecommerce-research",
    name: { zh: "电商选品 Agent", en: "E-commerce Research Agent" },
    tagline: { zh: "选品 → 抓取 → 评分 → 利润估算 → Excel", en: "Product sourcing → scoring → profit estimate → Excel" },
    description: {
      zh: "产品搜索 → 抓取 → 筛选 → 评分 → 竞争分析 → 利润估算 → Excel。面向跨境电商选品流程。",
      en: "Search → scrape → filter → score → competitor analysis → profit estimate → Excel. For cross-border sourcing.",
    },
    flow: [
      { zh: "选品目标", en: "Goal" },
      { zh: "产品搜索", en: "Product search" },
      { zh: "抓取筛选", en: "Scrape & filter" },
      { zh: "评分竞争", en: "Score & rivals" },
      { zh: "利润估算", en: "Profit estimate" },
      { zh: "Excel", en: "Excel" },
    ],
    category: { zh: "电商", en: "E-commerce" },
    capabilities: [
      { zh: "购物搜索", en: "Shopping search" },
      { zh: "浏览器抓取", en: "Browser scraping" },
      { zh: "表格分析", en: "Tabular analysis" },
    ],
    slots: [
      { role: { zh: "浏览器", en: "Browser" }, ids: ["browser-bridge"] },
      { role: { zh: "购物搜索", en: "Search" }, ids: ["argo"] },
      { role: { zh: "商品提取", en: "Product Extractor" }, ids: [] },
      { role: { zh: "价格跟踪", en: "Price Tracker" }, ids: [] },
      { role: { zh: "数据分析", en: "Data Analysis" }, ids: ["dsh-toolkit"] },
      { role: { zh: "导出 Excel", en: "Excel" }, ids: [] },
    ],
  },
  {
    id: "research-os",
    name: { zh: "Research OS（自由组合）", en: "Research OS (compose freely)" },
    tagline: { zh: "自己挑选 8 类能力，Forge 自动组装", en: "Pick your own stack — Forge assembles it" },
    description: {
      zh: "不预设模板：+ Web Search、Browser、GitHub、PDF、Python、Excel、Citation、Document，在 Composer 里自由组合、解析依赖并一键安装。",
      en: "No preset: add Web Search, Browser, GitHub, PDF, Python, Excel, Citation, Document — compose, resolve and install in the Composer.",
    },
    flow: [
      { zh: "选择组件", en: "Pick components" },
      { zh: "解析依赖", en: "Resolve" },
      { zh: "生成组合", en: "Create bundle" },
      { zh: "一键安装", en: "Install" },
    ],
    category: { zh: "自定义", en: "Custom" },
    capabilities: [
      { zh: "网页研究", en: "Web research" },
      { zh: "浏览器自动化", en: "Browser automation" },
      { zh: "数据分析", en: "Data analysis" },
      { zh: "引用", en: "Citation" },
      { zh: "文档生成", en: "Document generation" },
    ],
    composerOnly: true,
    slots: [],
  },
];

/** Resolve a recipe against the real registry list. */
export interface ResolvedSlot {
  recipe: Recipe;
  slot: RecipeSlot;
  componentId: string | null;
}

export function resolveRecipe(recipe: Recipe, registryIds: Set<string>): ResolvedSlot[] {
  return recipe.slots.map((slot) => ({
    recipe,
    slot,
    componentId: slot.ids.find((id) => registryIds.has(id)) ?? null,
  }));
}
