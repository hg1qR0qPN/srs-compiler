// blackmatrix7 Clash YAML -> sing-box source rule-set JSON
// 字段映射：DOMAIN→domain、DOMAIN-SUFFIX→domain_suffix、DOMAIN-KEYWORD→domain_keyword、
//          IP-CIDR/IP-CIDR6→ip_cidr、PROCESS-NAME→process_name。
// USER-AGENT / IP-ASN 在 sing-box rule-set 无对应字段，丢弃。
import { readFileSync, writeFileSync } from 'node:fs';

const FIELD = {
  DOMAIN: 'domain',
  'DOMAIN-SUFFIX': 'domain_suffix',
  'DOMAIN-KEYWORD': 'domain_keyword',
};

export function convertBm7(text) {
  const r = {};
  const push = (k, v) => (r[k] ??= []).push(v);
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (line.startsWith('- ')) line = line.slice(2).trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf(',');
    if (i === -1) continue;
    const type = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (FIELD[type]) push(FIELD[type], value);
    else if (type === 'IP-CIDR' || type === 'IP-CIDR6') push('ip_cidr', value.split(',')[0].trim());
    else if (type === 'PROCESS-NAME') push('process_name', value.split(',')[0].trim());
  }
  for (const k of Object.keys(r)) r[k] = [...new Set(r[k])].sort();
  return { version: 2, rules: [r] };
}

// CLI: node lib/bm7-to-source.mjs <input.yaml> <output.json>
if (process.argv[1] && process.argv[1].endsWith('bm7-to-source.mjs')) {
  const [, , input, output] = process.argv;
  if (!input || !output) {
    console.error('usage: node lib/bm7-to-source.mjs <input.yaml> <output.json>');
    process.exit(2);
  }
  writeFileSync(output, JSON.stringify(convertBm7(readFileSync(input, 'utf8')), null, 2) + '\n');
}
