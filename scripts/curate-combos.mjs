#!/usr/bin/env node
// 高质量组合包生成器：按 GitHub stars 精选 curated-registry 社区包，生成真实可用的
// 领域组合 Agent Bundle（agenthub.yaml + preset + skills + profile.patch.yml）。
// 设计依据：docs/combination-design.md（stars 质量信号 + 领域槽位 + 有效性门槛）。
//
// 用法：node scripts/curate-combos.mjs [--min-stars 500] [--out combos] [--skills-dir <真实 skill 目录>]
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptOne } from './adapt-skill.mjs';

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
// 真实 skill 目录（adapt-skill 批量产物）；缺省 combos/skills，存在同名 SKILL.md 即优先使用。
// flag 值可能是绝对路径，不能再 join(root) 拼接。
const SKILLS_DIR_FLAG = flag('skills-dir', 'combos');
const SKILLS_DIR = SKILLS_DIR_FLAG.startsWith('/') || /^[A-Za-z]:[\\/]/.test(SKILLS_DIR_FLAG)
  ? SKILLS_DIR_FLAG
  : join(root, SKILLS_DIR_FLAG);

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
      { role: '论文阅读', type: 'skill', cat: ['研究与知识'], skillSource: 'https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md' },
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
      { role: '表格数据', type: 'tool', cat: ['研究与知识', '生态与资源'], skillSource: 'https://github.com/anthropics/skills/blob/main/skills/xlsx/SKILL.md' },
    ],
  },
  {
    id: 'investment-research-combo',
    name: { zh: '投资研究 Agent', en: 'Investment Research Agent' },
    category: '金融 Finance',
    persona: '你是一名投资研究员。你擅长：公司基本面与估值分析、行业研究、风险识别。'
      + ' 输出是研究与决策支持，不构成投资建议；每条判断附证据与数据来源；不执行交易。',
    slots: [
      { role: '研究分析', type: 'skill', cat: ['研究与知识', 'Agent 与自动化'] },
      { role: '代码与模型', type: 'mcp', cat: ['Agent 与自动化', '开发与工程'] },
    ],
  },
  {
    id: 'content-creator-combo',
    name: { zh: '内容生产 Agent', en: 'Content Creator Agent' },
    category: '内容 Content',
    persona: '你是一名内容创作者。你擅长：图文内容生产、视觉素材制作与配图、多平台适配。'
      + ' 产出需符合目标平台规范；涉及事实断言需可溯源。',
    slots: [
      { role: '视觉与图像', type: 'skill', cat: ['视觉与图像'] },
      { role: '图片工具', type: 'tool', cat: ['视觉与图像', '实用工具与其他'] },
    ],
  },
  {
    id: 'github-analyzer-combo',
    name: { zh: 'GitHub 项目分析 Agent', en: 'GitHub Project Analyzer' },
    category: '开发 Development',
    persona: '你是一名开源项目分析师。你擅长：仓库结构与架构理解、代码质量审查、安全与许可评估。'
      + ' 审查意见基于代码事实并引用文件与行号；不臆造 API 或指标。',
    slots: [
      { role: '代码能力', type: 'mcp', cat: ['Agent 与自动化', '开发与工程'] },
      { role: '代码审查', type: 'skill', cat: ['开发与工程'] },
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
async function buildCombo(packages, combo) {
  const dir = join(OUT, combo.id);
  mkdirSync(join(dir, 'preset', combo.id), { recursive: true });
  mkdirSync(join(dir, 'skills'), { recursive: true });
  const picked = [];      // curated 精选组件（无 skillSource 的槽位）
  const realSkills = [];  // 真实拉取的 skill 名（有 skillSource 的槽位，不依赖 curated 匹配）
  for (const slot of combo.slots) {
    if (slot.skillSource) {
      // 真实 skill 槽位：直接拉取（成功则用真实内容；失败跳过，诚实不产出假组合）
      try {
        const target = await adaptOne(slot.skillSource, join(dir, 'skills'), slot.skillName);
        // target = <skills>/<name>/SKILL.md → 取父目录名作为 skill 名（agenthub.yaml 引用）
        const name = target.split('/').slice(-2, -1)[0];
        realSkills.push(name);
        console.log(`  ${combo.id} → ${name}：真实 skill（${slot.skillSource}）`);
      } catch (err) {
        console.log(`  ${combo.id} → skillSource 拉取失败跳过：${err.message.slice(0, 60)}`);
      }
      continue;
    }
    const p = pickForSlot(packages, slot);
    if (p) {
      picked.push({ role: slot.role, ...p });
      const skillDir = join(dir, 'skills', p.id);
      mkdirSync(skillDir, { recursive: true });
      // --skills-dir 同名存在则用真实内容，否则元数据骨架。
      const realSkill = join(SKILLS_DIR, p.id, 'SKILL.md');
      if (existsSync(realSkill)) {
        copyFileSync(realSkill, join(skillDir, 'SKILL.md'));
        console.log(`  ${combo.id} → ${p.id}：使用真实 skill（${realSkill}）`);
      } else {
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
  }
  const skills = [...picked.map((p) => p.id), ...realSkills];

  // agenthub.yaml：components.skills 引用已落盘的 SKILL.md；preset 提供领域 persona；
  // UI bundle：扫描 bundle/ 目录下已有子包（如 code-review-ui），保留其挂载（重跑不丢）。
  const uiBundles = [];
  const bundleRoot = join(dir, 'bundle');
  if (existsSync(bundleRoot)) {
    for (const sub of readdirSync(bundleRoot)) {
      const pj = join(bundleRoot, sub, 'package.json');
      if (existsSync(pj)) {
        try {
          const p = JSON.parse(readFileSync(pj, 'utf8'));
          if (p.name) uiBundles.push({ name: p.name, version: p.version || '0.1.0' });
        } catch { /* skip malformed */ }
      }
    }
  }
  const bundleYaml = uiBundles.length === 0
    ? '  bundles: []'
    : ['  bundles:'].concat(uiBundles.map((b) => `    - package: "${b.name}"\n      version: "${b.version}"`)).join('\n');
  const profileBundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'].concat(uiBundles.map((b) => b.name));

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
    bundleYaml,
    '  presets:',
    '    - id: ' + combo.id,
    '      base: standard',
    '  skills:',
    ...skills.map((s) => '    - ' + s),
    'profile:',
    '  name: ' + combo.id,
    '  bundles: [' + profileBundles.map((b) => '"' + b + '"').join(', ') + ']',
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
  const r = await buildCombo(packages, combo);
  built.push(r);
  console.log(`✓ ${r.id}：精选 ${r.slots} 个组件 → ${r.components.join(', ') || '（无满足阈值的组件）'}`);
}
writeFileSync(join(OUT, 'combos.json'), JSON.stringify(built, null, 2) + '\n');
console.log(`组合清单 → ${join(OUT, 'combos.json')}`);
