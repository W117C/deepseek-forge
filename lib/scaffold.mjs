// 开发者脚手架：生成一个新的 Agent Bundle 目录（M4 起步）。
// preset 直接复制官方 standard 组合并替换 persona——保证组合必然可挂载。
import { existsSync, mkdirSync, writeFileSync, readFileSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { systemPresetsDir } from './dsh.mjs';
import { loadAgentManifest } from './manifest.mjs';

const PATCH_ROWS = [
  '# {corePkg} —— TODO：你的宿主平面行（数据源 MCP seam、调度、存储…）。',
  '# 示例：hello-row 打开 web 搜索与全文抓取（health 检查用它验证 bundle 生效）。',
  '- insert:',
  '    - id: hello-row',
  "      name: '@deepseek-ai/dsh-tool-web'",
  '      config:',
  '        search: true',
  '        fetch: true',
  '',
].join('\n');

export function createAgent({ outDir, id, name, category, publisher, bin }) {
  if (existsSync(join(outDir, 'agenthub.yaml'))) throw new Error('目标目录已有 Agent：' + outDir);
  mkdirSync(outDir, { recursive: true });
  const corePkg = '@' + publisher + '/' + id + '-core';

  writeFileSync(join(outDir, 'agenthub.yaml'), [
    'schema: agenthub.dev/agent/v1',
    'id: ' + id,
    'name: ' + name,
    'category: ' + category,
    'version: 0.1.0',
    'description: ' + name + '：TODO 一句话描述这个 Agent 的能力。',
    'publisher:',
    '  id: ' + publisher,
    '  name: ' + publisher,
    'runtime: deepseek-harness',
    'compatibility:',
    '  dsh:',
    '    min: "0.1.0-rc.6"',
    '    tested: ["0.1.0-rc.6"]',
    '  node: ">=22"',
    'platform: [darwin, linux]',
    'components:',
    '  bundles:',
    '    - package: "' + corePkg + '"',
    '      version: "0.1.0"',
    '  presets:',
    '    - id: ' + id,
    '      base: standard',
    '  skills:',
    '    - hello-skill',
    'profile:',
    '  name: ' + id,
    '  bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "' + corePkg + '"]',
    '  patch: ./profile.patch.yml',
    'permissions:',
    '  network: []',
    '  env: []',
    'secrets: []',
    'health:',
    '  - kind: dump-config',
    '    expect-rows: [hello-row]',
    'updatePolicy: notify',
    'trust: community',
    '',
  ].join('\n'));

  const bdir = join(outDir, 'bundle', id + '-core');
  mkdirSync(bdir, { recursive: true });
  writeFileSync(join(bdir, 'package.json'), JSON.stringify({
    name: corePkg, version: '0.1.0',
    description: name + ' host-plane bundle',
    type: 'module',
    exports: { './cordis.patch.yml': './cordis.patch.yml', './package.json': './package.json' },
    files: ['cordis.patch.yml'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    dependencies: { '@deepseek-ai/dsh-tool-web': '^0.1.0-rc.6' },
    license: 'MIT',
  }, null, 2) + '\n');
  writeFileSync(join(bdir, 'cordis.patch.yml'), PATCH_ROWS.replace('{corePkg}', corePkg));

  const stdPreset = join(systemPresetsDir(bin), 'standard', 'agent.cordis.yml');
  if (!existsSync(stdPreset)) throw new Error('找不到官方 standard preset：' + stdPreset);
  const std = readFileSync(stdPreset, 'utf8');
  const persona = '      You are the ' + name + ' agent powered by the {{model}} model. Your working directory is {{cwd}}.\n' +
    '\n      TODO: 在这里写你的领域人设、硬性规则（如：不虚构数据、引用带来源、不执行某类操作）。';
  const composed = std.replace(/text: >-\n      You are a coding agent powered by the \{\{model\}\} model\. Your working directory is \{\{cwd\}\}\./, 'text: |-\n' + persona);
  const pdir = join(outDir, 'preset', id);
  mkdirSync(join(pdir, 'skills', 'hello-skill'), { recursive: true });
  writeFileSync(join(pdir, 'agent.cordis.yml'), composed);
  writeFileSync(join(pdir, 'preset.yml'), 'name: ' + name + '\ndescription: ' + name + '：TODO 描述。\n');
  writeFileSync(join(pdir, 'skills', 'hello-skill', 'SKILL.md'), [
    '---',
    'name: hello-skill',
    'description: ' + name + ' 的示例技能。TODO：改成你的第一个技能（何时使用、工作流程、硬性规则）。',
    '---',
    '',
    '# Hello Skill',
    '',
    'TODO：写技能正文。',
    '',
  ].join('\n'));

  writeFileSync(join(outDir, 'profile.patch.yml'), [
    '# ' + id + ' 托管段（由 agenthub 写入 profile 的 cordis.patch.yml，可自由编辑）。',
    '[]',
    '',
  ].join('\n'));
  writeFileSync(join(outDir, 'README.md'), [
    '# ' + name,
    '',
    'TODO：写使用说明。',
    '',
    '## 安装',
    '',
    '```sh',
    'node ../../cli/agenthub.mjs install . --yes',
    'dsh --profile ' + id,
    '```',
    '',
    '## 发布',
    '',
    '```sh',
    'node ../../cli/agenthub.mjs keygen',
    'node ../../cli/agenthub.mjs publish . --registry http://127.0.0.1:PORT',
    '```',
    '',
  ].join('\n'));

  return { outDir, corePkg };
}

// Agent Builder（最小实现）：组合多个 Agent（Bundle + Preset + Skills 并集）生成新 Agent。
// 冲突策略：同名 preset / 同名 bundle 不同版本 / 同名 skill → 显式报错（不静默合并）。
export function composeAgent({ outDir, id, name, category, publisher, sources }) {
  if (existsSync(join(outDir, 'agenthub.yaml'))) throw new Error('目标目录已有 Agent：' + outDir);
  if (!sources || sources.length < 2) throw new Error('组合至少需要 2 个来源 Agent（--from 可重复）');
  mkdirSync(outDir, { recursive: true });

  const loaded = sources.map((dir) => ({ dir, m: loadAgentManifest(dir) }));
  const uniq = (arr) => { const seen = new Set(); const out = []; for (const x of arr) { if (seen.has(x)) continue; seen.add(x); out.push(x); } return out; };

  const bundles = [];
  const bundleSrc = new Map();
  for (const { dir, m } of loaded) {
    for (const b of m.components.bundles) {
      const pkg = b.package;
      const src = join(dir, 'bundle', pkg.split('/').pop());
      if (!existsSync(join(src, 'package.json'))) throw new Error('来源 bundle 目录无效：' + src);
      if (bundleSrc.has(pkg) && bundleSrc.get(pkg) !== src) throw new Error('冲突：bundle ' + pkg + ' 出现在多个来源且目录不同');
      bundleSrc.set(pkg, src);
      if (!bundles.some((x) => x.package === pkg)) bundles.push(b);
    }
  }
  const presets = [];
  const presetSrc = new Map();
  for (const { dir, m } of loaded) {
    for (const p of m.components.presets) {
      const src = join(dir, 'preset', p.id);
      if (!existsSync(join(src, 'agent.cordis.yml'))) throw new Error('来源 preset 目录无效：' + src);
      if (presetSrc.has(p.id) && presetSrc.get(p.id) !== src) throw new Error('冲突：preset ' + p.id + ' 出现在多个来源');
      presetSrc.set(p.id, src);
      if (!presets.some((x) => x.id === p.id)) presets.push(p);
    }
  }
  const skills = [];
  const skillSrc = new Map();
  for (const { dir, m } of loaded) {
    for (const s of m.components.skills) {
      const cand = [join(dir, 'skills', s), join(dir, 'preset', m.components.presets[0]?.id, 'skills', s)].find((p) => existsSync(join(p, 'SKILL.md')));
      if (!cand) throw new Error('找不到来源 skill：' + s);
      skillSrc.set(s, cand);
      if (!skills.includes(s)) skills.push(s);
    }
  }
  const network = uniq(loaded.flatMap(({ m }) => m.permissions?.network ?? []));
  const expectRows = uniq(loaded.flatMap(({ m }) => (m.health ?? []).flatMap((h) => h['expect-rows'] ?? [])));
  const profileBundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...bundles.map((b) => b.package)];

  writeFileSync(join(outDir, 'agenthub.yaml'), [
    'schema: agenthub.dev/agent/v1',
    'id: ' + id,
    'name: ' + name,
    'category: ' + category,
    'version: 0.1.0',
    'description: ' + name + '：由 ' + loaded.map(({ m }) => m.name).join(' + ') + ' 组合而成（Agent Builder）。',
    'publisher:',
    '  id: ' + publisher,
    '  name: ' + publisher,
    'runtime: deepseek-harness',
    'compatibility:',
    '  dsh:',
    '    min: "0.1.0-rc.6"',
    '    tested: ["0.1.0-rc.6"]',
    '  node: ">=22"',
    'platform: [darwin, linux]',
    'components:',
    '  bundles:',
    ...bundles.map((b) => '    - package: "' + b.package + '"'),
    '  presets:',
    ...presets.map((p) => '    - id: ' + p.id),
    '  skills:',
    ...skills.map((s) => '    - ' + s),
    'profile:',
    '  name: ' + id,
    '  bundles: [' + profileBundles.map((b) => '"' + b + '"').join(', ') + ']',
    '  patch: ./profile.patch.yml',
    'permissions:',
    '  network: [' + network.map((n) => '"' + n + '"').join(', ') + ']',
    '  env: []',
    'secrets: []',
    'health:',
    '  - kind: dump-config',
    '    expect-rows: [' + expectRows.join(', ') + ']',
    'updatePolicy: notify',
    'trust: community',
    '',
  ].join('\n'));

  for (const [pkg, src] of bundleSrc) {
    cpSync(src, join(outDir, 'bundle', pkg.split('/').pop()), { recursive: true });
  }
  for (const [pid, src] of presetSrc) {
    cpSync(src, join(outDir, 'preset', pid), { recursive: true });
  }
  for (const [s, src] of skillSrc) {
    const dst = join(outDir, 'skills', s);
    mkdirSync(dst, { recursive: true });
    cpSync(src, dst, { recursive: true });
  }
  writeFileSync(join(outDir, 'profile.patch.yml'), ['# ' + id + ' 托管段（组合 Agent）。', '[]', ''].join('\n'));
  writeFileSync(join(outDir, 'README.md'), [
    '# ' + name,
    '',
    '由 Agent Builder 组合生成：' + loaded.map(({ m }) => m.name).join(' + ') + '。',
    '',
    '安装：',
    '',
    '    node ../../cli/agenthub.mjs install . --yes',
    '    dsh --profile ' + id,
    '',
  ].join('\n'));
  return { outDir, bundles: bundles.length, presets: presets.length, skills: skills.length };
}
