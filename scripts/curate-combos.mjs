#!/usr/bin/env node
// 高质量组合包生成器：按 GitHub stars 精选 curated-registry 社区包，生成真实可用的
// 领域组合 Agent Bundle（agenthub.yaml + preset + skills + profile.patch.yml）。
// 设计依据：docs/combination-design.md（stars 质量信号 + 领域槽位 + 有效性门槛）。
//
// 用法：node scripts/curate-combos.mjs [--min-stars 500] [--out combos]
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const registryDir = join(root, 'curated-registry', 'packages');
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? def : args[i + 1];
};
const MIN_STARS = Number(flag('min-stars', 500));
const OUT = join(root, flag('out', 'combos'));

// 1. 加载 curated 包（stars/type/category/description 质量信号）
function loadPackages() {
  const out = new Map();
  for (const id of readdirSync(registryDir)) {
    const pj = join(registryDir, id, 'package.json');
    if (!existsSync(pj)) continue;
    try {
      const p = JSON.parse(readFileSync(pj, 'utf8'));
      out.set(p.id, {
        id: p.id,
        type: p.type,
        category: p.category,
        stars: (p.extra && p.extra.stars) || 0,
        description: p.description || '',
        repository: (p.source && p.source.repository) || null,
      });
    } catch { /* skip malformed */ }
  }
  return out;
}

// 2. 领域组合模板：槽位 → 匹配规则（type/category 关键词），首个高星包胜出
const COMBOS = [
  {
    id: 'deep-research-combo',
    name: { zh: '深度研究 Agent', en: 'Deep Research Agent' },
    category: '研究 Research',
    persona: '你是一名深度研究分析师。你擅长：网页搜索与资料浏览、论文阅读与引文核验、结构化研究报告撰写。'
      + ' 所有结论必须附来源（URL 或工具名）与时间点；数据缺口显式说明；不确定的数值标注"估算/未核实"。',
    slots: [
      { role: '搜索与浏览', type: 'skill', cat: ['研究与知识', '视觉与图像', 'Agent 与自动化'] },
      { role: '论文阅读', type: 'skill', cat: ['研究与知识'] },
      { role: '代码审查辅助', type: 'skill', cat: ['开发与工程'] },
    ],
  },
  {
    id: 'coding-agent-combo',
    name: { zh: '工程编码 Agent', en: 'Coding Agent' },
    category: '开发 Development',
    persona: '你是一名资深软件工程师。你擅长：代码理解、AI 代码审查、工程最佳实践落地。'
      + ' 审查意见必须基于代码事实，引用具体文件与行号；不臆造 API。',
    slots: [
      { role: '代码能力', type: 'mcp', cat: ['Agent 与自动化', '开发与工程'] },
      { role: '代码审查', type: 'skill', cat: ['开发与工程'] },
      { role: '架构设计', type: 'skill', cat: ['视觉与图像', '开发与工程'] },
    ],
  },
  {
    id: 'data-analyst-combo',
    name: { zh: '数据分析 Agent', en: 'Data Analyst Agent' },
    category: '数据 Data',
    persona: '你是一名数据分析师。你擅长：数据取数与清洗、统计分析、可视化呈现。'
      + ' 分析结论必须可复现：注明数据来源、处理步骤与口径；不做无依据的因果断言。',
    slots: [
      { role: '图像与可视化', type: 'skill', cat: ['视觉与图像'] },
      { role: '通用自动化', type: 'skill', cat: ['Agent 与自动化'] },
      { role: '记忆与上下文', type: 'tool', cat: ['研究与知识', '生态与资源'] },
    ],
  },
];

// 3. 槽位精选：按匹配规则筛包，stars 降序取第一个（stars ≥ MIN_STARS）
function pickForSlot(packages, slot) {
  const cands = [...packages.values()].filter(
    (p) =>
      p.type === slot.type &&
      (slot.cat.length === 0 || slot.cat.some((c) => (p.category || '').includes(c))) &&
      p.stars >= MIN_STARS
  );
  cands.sort((a, b) => b.stars - a.stars);
  return cands[0] || null;
}

// 4. 生成标准 Agent Bundle 目录（十步管线可直接安装）
function buildCombo(packages, combo) {
  const dir = join(OUT, combo.id);
  mkdirSync(join(dir, 'preset', combo.id), { recursive: true });
  mkdirSync(join(dir, 'skills'), { recursive: true });
  const picked = [];
  for (const slot of combo.slots) {
    const p = pickForSlot(packages, slot);
    if (p) {
      picked.push({ role: slot.role, ...p });
      // 从 curated 元数据生成 SKILL.md（诚实标注来源；真实实体由适配流程替换）
      const skillDir = join(dir, 'skills', p.id);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), [
        '---',
        'name: ' + p.id,
        'description: ' + (p.description || '') + '（来源：' + (p.repository || p.id) + '，stars ' + p.stars + '）',
        '---',
        '',
        '# ' + p.id,
        '',
        '来自 curated-registry 的高星组件（stars ' + p.stars + '）：' + (p.description || ''),
        '使用该能力时遵循其仓库文档与最佳实践。',
        '',
      ].join('\n') + '\n');
    }
  }
  const skills = picked.map((p) => p.id);

  // agenthub.yaml：components.skills 引用已落盘的 SKILL.md；preset 提供领域 persona
  writeFileSync(join(dir, 'agenthub.yaml'), [
    'schema: agenthub.dev/agent/v1',
    'id: ' + combo.id,
    'name: ' + combo.name.zh,
    'category: ' + combo.category,
    'version: 0.1.0',
    'description: ' + combo.name.zh + '：按 stars 精选社区高星组件组合而成（' + picked.map((p) => p.id).join(', ') + '）。',
    'publisher:',
    '  id: agenthub',
    '  name: AgentHub',
    'runtime: deepseek-harness',
    'compatibility:',
    '  dsh:',
    '    min: "0.1.0-rc.6"',
    '    tested: ["0.1.0-rc.6"]',
    '  node: ">=22"',
    'platform: [darwin, linux]',
    'components:',
    '  bundles: []',
    '  presets:',
    '    - id: ' + combo.id,
    '      base: standard',
    '  skills:',
    ...skills.map((s) => '    - ' + s),
    'profile:',
    '  name: ' + combo.id,
    '  bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]',
    '  patch: ./profile.patch.yml',
    'permissions:',
    '  network: []',
    '  env: []',
    'secrets: []',
    'health:',
    '  - kind: dump-config',
    '    expect-rows: []',
    'updatePolicy: notify',
    'trust: community',
    '',
  ].join('\n'));

  writeFileSync(join(dir, 'profile.patch.yml'), ['# ' + combo.id + ' 托管段（组合 Agent）。', '[]', ''].join('\n'));

  // preset：standard 复制 + 领域 persona（与 createAgent 同构；从本地 dsh 复制）
  const bin = process.env.AGENTHUB_DSH_BIN;
  const presetSrc = join(dir, 'preset', combo.id);
  // 简版 persona 文件（完整 agent.cordis.yml 由安装流程的 preset 复制逻辑覆盖）
  writeFileSync(join(presetSrc, 'preset.yml'), 'name: ' + combo.name.zh + '\ndescription: ' + combo.description + '\n');
  const personaLines = combo.persona.split('\n').map((l) => '        ' + l.trim()).join('\n');
  writeFileSync(join(presetSrc, 'agent.cordis.yml'), [
    '# 组合预设（由 curate-combos 生成）：领域 persona + 高星 skill 能力。',
    '- id: persona',
    "  name: '@deepseek-ai/dsh-persona'",
    '  config:',
    '    text: |-',
    personaLines,
    '',
  ].join('\n') + '\n');

  writeFileSync(join(dir, 'README.md'), [
    '# ' + combo.name.zh,
    '',
    '按 GitHub stars 精选社区高星组件组合：',
    ...picked.map((p) => `- **${p.role}**：${p.id}（${p.stars} stars）`),
    '',
    '安装：',
    '',
    '    node cli/agenthub.mjs install combos/' + combo.id + ' --yes',
    '    dsh --profile ' + combo.id,
    '',
  ].join('\n') + '\n');

  return { id: combo.id, name: combo.name.zh, slots: picked.length, components: picked.map((p) => p.id) };
}

// 5. 执行
const packages = loadPackages();
console.log(`curated 包总数：${packages.size}（stars ≥ ${MIN_STARS} 的候选按槽位精选）`);
const built = [];
for (const combo of COMBOS) {
  const r = buildCombo(packages, combo);
  built.push(r);
  console.log(`✓ ${r.id}：精选 ${r.slots} 个组件 → ${r.components.join(', ') || '（无满足阈值的组件）'}`);
}
writeFileSync(join(OUT, 'combos.json'), JSON.stringify(built, null, 2) + '\n');
console.log(`组合清单 → ${join(OUT, 'combos.json')}`);
