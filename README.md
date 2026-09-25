# srs-compiler

按分类拉取多个来源的规则（`SagerNet/sing-geosite` 的现成 `.srs`、`blackmatrix7` 的 Clash YAML），
合并并编译为 sing-box rule-set（`.srs`）。

## 背景

分类覆盖与血缘分析见 [`docs/rule-set-coverage.md`](docs/rule-set-coverage.md) 与
[`docs/rule-set-reference.md`](docs/rule-set-reference.md)。结论要点：

- 微博 / 小红书 / Gemini / Anthropic：**SagerNet（v2fly 系）单源**即可；
- OpenAI：需 **v2fly ∪ blackmatrix7**（官方基础设施 + 第三方 SaaS/追踪）；
- bilibili：需 **v2fly ∪ blackmatrix7**（域名 + CDN/IP/process）。

## 依赖

- `sing-box` >= 1.14（PATH 中，或用 `SINGBOX_BIN=/path/to/sing-box` 指定）：提供 `rule-set decompile|merge|compile`；
- Node >= 18（内置 `fetch`）。

## 使用

```bash
npm run build                     # 构建全部分类
node build.mjs bilibili openai    # 只构建指定分类
```

产物写入 `out/<分类>.srs`。

## 目录结构

```
categories.json        # 分类 → 来源 配方
build.mjs              # 拉取/解包/转换 → merge → compile
lib/bm7-to-source.mjs  # blackmatrix7 Clash YAML → sing-box source JSON
docs/                  # 规则集总览与覆盖分析（自 singbox-generator 迁入）
.cache/                # 中间产物（gitignored）
out/                   # 生成的 .srs（gitignored）
```

## 分类配方

| 分类 | 来源 |
| --- | --- |
| bilibili | `singGeosite: bilibili` ⊕ `blackmatrix7: BiliBili` |
| openai | `singGeosite: openai` ⊕ `blackmatrix7: OpenAI` |
| weibo | `singGeosite: sina`（微博域名在 v2fly 的 `sina` 集内） |
| xiaohongshu | `singGeosite: xiaohongshu` |
| gemini | `singGeosite: google-gemini` |
| anthropic | `singGeosite: anthropic` |

新增分类：编辑 `categories.json`。来源字段：

- `singGeosite`：`SagerNet/sing-geosite@rule-set/geosite-<名>.srs` 分类名（解包现成 `.srs`）；
- `blackmatrix7`：`blackmatrix7/ios_rule_script@master/rule/Clash/<名>/<名>.yaml` 规则名（转换 Clash YAML）。

### 排除无关规则（`exclude`）

上游分类常混入**第三方共用服务**，会把无关流量误导向该服务的策略组。例如 blackmatrix7 的 `OpenAI`
含 `stripe.com`（支付）、`auth0.com`（认证）、`intercom.io`、`algolia.net`、`segment.io`、`sentry.io` 等。
`categories.json` 的 `exclude` 可按分类剔除这些精确域名（剔除后仍会被 `GeoLocation-!CN` / `GeoSite-CN` 正常兜底）：

```json
"exclude": { "openai": ["stripe.com", "auth0.com", "..."] }
```

## 自动构建（GitHub Actions）

[`.github/workflows/build.yml`](.github/workflows/build.yml) 每日 18:00 UTC（北京 02:00）及手动触发时：
拉取上游 → `node build.mjs` → 将变更后的 `out/*.srs` 提交回本仓库。`out/` 是**被跟踪**的（不忽略），
`.cache/` 为本地中间产物（忽略）。

本地运行同一流程：`npm run build`。

## 分发端点

默认 `https://testingcf.jsdelivr.net/gh`（Cloudflare，大陆直连可达性较好）。可改 `categories.json` 的
`base` 为 `https://cdn.jsdelivr.net/gh` / `https://fastly.jsdelivr.net/gh` / `https://gcore.jsdelivr.net/gh`。

## FAQ

### 为什么要 `decompile` → `merge` → `compile`，不能直接用文本源？

`sing-box rule-set merge` / `compile` 只接受 **source JSON**。而 SagerNet 的分类产物是**二进制 `.srs`**
（另有一个聚合 `geosite.db`），所以必须先取到 source JSON——两条路：`rule-set decompile <cat>.srs`，
或 `geosite export <cat> -f geosite.db`（结果等价）。

**文本源确实存在**，只是需要自己解析：

- `v2fly/domain-list-community/data/<name>`：真正的上游文本，但是 DSL——`include:`、`@attr`、`full:`、
  `regexp:`、裸 TLD 等语义都要复刻；
- `MetaCubeX/meta-rules-dat` 的 `meta/geo/geosite/<name>.list`：纯文本（`+.example.com` 表示后缀），较易解析。

从**已编译产物**解包能最大程度保持与 SagerNet 的结果一致（含属性处理），因此本项目默认走解包；
blackmatrix7 一侧本来就是文本（Clash YAML）。如需纯文本管线，可在 `build.mjs` 中新增 `v2fly`/`metaList`
来源类型。
