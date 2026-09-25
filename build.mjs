// srs-compiler：按 categories.json 拉取多来源文本 / 现成 .srs，合并并编译为 sing-box .srs。
// 依赖：PATH 中有 sing-box（>=1.14，提供 rule-set decompile/merge/compile），Node >= 18（内置 fetch）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { convertBm7 } from './lib/bm7-to-source.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SB = process.env.SINGBOX_BIN || 'sing-box';
const CACHE = path.join(ROOT, '.cache');
const OUT = path.join(ROOT, 'out');
mkdirSync(CACHE, { recursive: true });
mkdirSync(OUT, { recursive: true });

const cfg = JSON.parse(readFileSync(path.join(ROOT, 'categories.json'), 'utf8'));

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

function singbox(args) {
  execFileSync(SB, args, { stdio: 'inherit' });
}

// SagerNet/sing-geosite 现成分类 .srs -> source JSON（解包）
async function fromSingGeosite(category) {
  const srs = path.join(CACHE, `geosite-${category}.srs`);
  const json = path.join(CACHE, `sing-${category}.json`);
  await download(`${cfg.base}/SagerNet/sing-geosite@rule-set/geosite-${category}.srs`, srs);
  singbox(['rule-set', 'decompile', srs, '-o', json]);
  return json;
}

// blackmatrix7 Clash YAML -> source JSON（转换）
async function fromBlackmatrix7(name) {
  const yml = path.join(CACHE, `${name}.yaml`);
  const json = path.join(CACHE, `bm7-${name}.json`);
  await download(
    `${cfg.base}/blackmatrix7/ios_rule_script@master/rule/Clash/${name}/${name}.yaml`,
    yml,
  );
  writeFileSync(json, JSON.stringify(convertBm7(readFileSync(yml, 'utf8')), null, 2) + '\n');
  return json;
}

async function resolveSource(source) {
  if (source.singGeosite) return fromSingGeosite(source.singGeosite);
  if (source.blackmatrix7) return fromBlackmatrix7(source.blackmatrix7);
  throw new Error(`unknown source: ${JSON.stringify(source)}`);
}

// 从合并后的 source JSON 中剔除指定精确域名（去掉与分类无关的第三方共用服务）
function applyExcludes(jsonPath, exclude) {
  if (!exclude || !exclude.length) return 0;
  const set = new Set(exclude);
  const doc = JSON.parse(readFileSync(jsonPath, 'utf8'));
  let removed = 0;
  for (const rule of doc.rules) {
    for (const k of Object.keys(rule)) {
      const v = rule[k];
      if (Array.isArray(v)) {
        const kept = v.filter((x) => !set.has(x));
        removed += v.length - kept.length;
        if (kept.length) rule[k] = kept;
        else delete rule[k];
      } else if (typeof v === 'string' && set.has(v)) {
        delete rule[k];
        removed += 1;
      }
    }
  }
  doc.rules = doc.rules.filter((r) => Object.keys(r).length);
  writeFileSync(jsonPath, JSON.stringify(doc, null, 2) + '\n');
  return removed;
}

async function buildCategory(key, sources, exclude) {
  const parts = [];
  for (const source of sources) parts.push(await resolveSource(source));
  const merged = path.join(CACHE, `${key}.merged.json`);
  singbox(['rule-set', 'merge', merged, ...parts.flatMap((p) => ['-c', p])]);
  const excluded = applyExcludes(merged, exclude);
  const out = path.join(OUT, `${key}.srs`);
  singbox(['rule-set', 'compile', merged, '-o', out]);
  console.log(`✓ ${path.relative(ROOT, out)}${excluded ? `  (excluded ${excluded})` : ''}`);
}

const only = process.argv.slice(2);
for (const [key, sources] of Object.entries(cfg.categories)) {
  if (only.length && !only.includes(key)) continue;
  await buildCategory(key, sources, cfg.exclude?.[key]);
}
