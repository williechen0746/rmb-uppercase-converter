# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## 项目概述

人民币金额「小写 → 财务大写」转换工具。纯前端，零依赖，零构建步骤：没有 `package.json`、没有打包器、没有 lint 配置，也不是 git 仓库。产物就是磁盘上的这几个文件本身，双击 `index.html` 即可运行。修改后无需重新编译。

## 常用命令

```bash
# 运行全部测试（64 项断言；全部通过退出码 0，任一失败退出码 1）
node test.js

# 浏览器打开（直接双击 index.html 亦可）
python3 -m http.server

# 在浏览器中访问 http://localhost:8000/_selftest.html 可跑浏览器端自检
```

**无 lint 配置。** 本项目未接入 ESLint / Prettier，不要假设存在 `npm run lint`。

### 调试单个用例

`test.js` 是一次性跑完全部断言的整体脚本，**没有 `--filter` / 单例运行参数**。需要验证单个金额时，直接用 Node 求值，比改测试文件更快：

```bash
node -e "const R=require('./rmb-upper.js'); console.log(R.toUpper('10001'))"
# → 人民币壹万零壹元整

# 同时看解析结果，排查「被拒绝」还是「算错」
node -e "const R=require('./rmb-upper.js'); console.log(R.validate('1.234'), R.parseAmount('1,234.56'))"
# → { ok: false, message: '金额最多保留 2 位小数（分）' } { ok: true, neg: false, int: '1234', dec: '56' }
```

## 架构

三层，职责边界清晰，**核心逻辑与界面完全解耦**：

| 文件 | 角色 |
| --- | --- |
| `rmb-upper.js` | 全部转换算法。UMD 包装（同时挂 `window.RMBUpper` 和 `module.exports`），**不引用任何 DOM / 浏览器 API**，因此可在 Node 中直接单测 |
| `index.html` | 界面层。单文件自包含：内联 `<style>` + 内联 IIFE 脚本，通过 `<script src="rmb-upper.js">` 引入核心库 |
| `test.js` | Node 端测试，`require('./rmb-upper.js')` |
| `_selftest.html` | 浏览器端端到端自检 |

**关键约束：`_selftest.html` 是 `index.html` 的副本**——它等于「`index.html` 去掉结尾的 `</body>` + `</html>`」再拼接一段自检 `<script>` 块。因此**任何对 `index.html` 的改动都必须同步到 `_selftest.html`**，否则浏览器自检会在旧版界面上跑，产生假绿或假红。

同步时**不要手工复制粘贴**（易漏、易错位），按「复制主体 + 追加既有自检块」重算更可靠：

```bash
python3 - <<'PY'
import io
idx = io.open('index.html', encoding='utf-8').read()
sel = io.open('_selftest.html', encoding='utf-8').read()
block = sel[sel.rindex('\n<script>\n') + 1:]      # 末尾自检块，原样保留
tail = '</body>\n</html>\n'
assert idx.endswith(tail)
io.open('_selftest.html', 'w', encoding='utf-8').write(idx[:-len(tail)] + '\n' + block)
PY
```

校验同步是否成立：`_selftest.html` 应以「`index.html` 去掉结尾 tail」为前缀。注意行号（如“前 N 行相同”）会随改动漂移，不要把它当判据。

> **上面是简版，会丢掉 `_selftest.html` 的 `noindex` 注入。正式同步请用「搜索优化（SEO）配置」一节里的完整脚本**，其校验方式也见该节。

`_selftest.html` 的自检结果写入 `window.__SELFTEST__` 数组，并渲染到 id 为 `SELFTEST` 的 `div` 里（格式 `<<<PASS | 名称 ;; FAIL | 名称 | got=...>>>`）——这是给自动化抓取用的，不要删。它依赖 60ms 防抖，故用例间插入了 `await after(200)` 等待。

### 核心算法（`rmb-upper.js`）

处理顺序：`parseAmount` 校验规整 → `intToUpper` 整数部分 → `toUpper` 拼装角分与前后缀。

三条必须保持在心的设计决定：

1. **全程字符串运算，绝不经过 `Number`。** 目的是规避浮点误差（`0.1 + 0.2 !== 0.3`），从而正确处理到「分」。任何"先 parseFloat 再处理"的改动都会破坏精度保证。
2. **整数部分按 4 位一节从右往左分组**，节权位数组为 `BIG_UNITS = ['', '万', '亿', '万亿', '亿亿']`，最多支持 20 位整数（`MAX_INT_DIGITS`）。零的合并靠 `pendingZero` / `pendingZero + seg.charAt(0) === '0'` 判断，实现"连续多个 0 只写一个零"。整节为零时丢弃节权位（如 `100010000` → 壹亿零壹万元整）。
3. **`toUpper` 遇非法输入返回空字符串 `''`**，而不是抛异常。这是 UI 层的关键耦合点：`index.html` 必须先调 `RMB.validate()` 判断合法性，再调 `toUpper()` 取值——否则无法区分「非法」与「合法但为空」。

`parseAmount` 的返回值契约：

- 成功：`{ ok: true, neg, int, dec }`。`dec` **恒定补齐为 2 位**（`toUpper` 内部据此安全地取 `dec[0]` 作角、`dec[1]` 作分），不必再做长度判断。
- 失败：`{ ok: false, message }`，`message` 直接用于界面提示。界面层现在只消费 `ok` 与 `message` 两个字段。

输入容错在 `parseAmount` 内统一处理：千分位逗号、`￥`/`¥`、空格、全角数字与全角符号（`０-９．－`）、首部 `+`、前导零。

### 公开 API

`toUpper(input, options)` — 主入口，`options`：`prefix`（默认 `true`，是否加"人民币"）、`suffix`（默认 `'整'`，可传 `''`）、`zeroYuan`（默认 `true`，不足一元是否写"零元"）。

另有 `validate`、`formatAmount`（加千分位展示，界面层目前仅用于历史记录条目的回显）、`parseAmount`、`intToUpper`、`groupToUpper`，以及常量 `BIG_UNITS` / `DIGITS` / `MAX_INT_DIGITS`。后两组目前只为外部调用方与测试保留，界面层已不再引用。

### 界面层要点（`index.html`）

内联 IIFE 内的状态：`lastUpper` / `lastValid`（供复制按钮与 `⌘/Ctrl+C` 使用）、`history`（`localStorage` 键 `rmb-upper-history`，最多保留 8 条）、`SUPPORT_HINT`（输入框下方的常驻提示文案，空态与合法态共用）。

已移除的界面元素（**不要再重新引入**，除非用户明确要求）：示例金额 chips、千分位回显 `#formatted`、"元后写整" 提示 `#rule`、"复制小写" 按钮、分节解析卡片 `#breakdownCard` 及其 `buildBreakdown()`。移除时已同步清掉对应的死 CSS（`.chips` / `.chip` / `.breakdown` / `.seg`）。

三个格式开关 `#optPrefix` / `#optZheng` / `#optZeroYuan` 映射到 `options()` 返回的 `toUpper` 参数对象。输入监听带 60ms 防抖，改动渲染逻辑时注意保持该时序（`_selftest.html` 依赖它）。

**默认值陷阱：库与界面的 `prefix` 默认不一致，这是刻意的。** `toUpper()` 自身默认 `prefix: true`，`test.js` 的全部期望值都基于此（不要改库默认）；而界面的 `#optPrefix` 复选框**默认不勾选**，初始输出不带"人民币"（`1234.56` → `壹仟贰佰叁拾肆元伍角陆分`）。因此 **`_selftest.html` 的期望值按"无前缀"书写**——改动任何复选框的默认状态都必须同步修正自检断言，否则自检会假红。另两个开关默认勾选。

## 转换规则

依据中国人民银行《支付结算办法》附一《正确填写票据和结算凭证的基本规定》：

1. 大写数字 `零壹贰叁肆伍陆柒捌玖`，单位 `拾佰仟万亿`、`元角分`、`整`
2. 金额到「元」为止的，元后写「整」；到「角」为止的，角后可写「整」；有「分」的，分后不写「整」
3. 数字中间有 0 时写「零」，连续多个 0 只写一个「零」（`1001` → 壹仟零壹）
4. 中文大写金额数字前应标明「人民币」字样，且应紧接填写，不得留有空白

**来源链接（`index.html` 页脚、`README.md` 均已引用）**：
`https://www.cncc.cn/zcfg/200903/t20090323_286.html`

该页由**中国人民银行清算总中心**（中国人民银行直属机构）发布，页面标题为「支付结算管理办法」，内含《支付结算办法》全文及附一《正确填写票据和结算凭证的基本规定》原文。已用脚本剥离 HTML 后逐段核对：附一一～七条齐全，含「中文大写金额数字前应标明『人民币』字样」一条。链接**文字写《正确填写票据和结算凭证的基本规定》**，与页内该节内容对应。

**踩过的两个坑，不要再犯**：

1. 曾把链接文字写成附一、却指向 `pbc.gov.cn` 的 2024 年**修改决定**页——文字与落地内容不符，用户核对后指出。给法规链接前**必须实际打开落地页确认其正文**，不能只看标题或搜索摘要。
2. 曾因「人民银行官网规章栏目无全文、gov.cn 公报只有修改决定」就断言「该附一没有官方页面」——**结论是错的**。该全文由人民银行的**直属机构站点**（`cncc.cn`）发布，不在 `pbc.gov.cn` 主域内。**检索时不要把范围限定在单一主域**；官方信息常分布在直属机构、地方分支的独立域名上。

该页 2009 年发布，收录银发〔1997〕393号原文；2024 年修改决定（仅删除第一百二十五条、第一百九十二条第二款、第一百九十七条）**不影响附一与本工具涉及的金额书写规则**。

页脚样式为 `footer a`。日后更换链接须同样实地确认落地页正文。

> **已知合规冲突（用户明确选择，勿擅自"修正"）**：附一第 4 条要求大写金额前标明「人民币」字样，而界面 `#optPrefix` 默认不勾选，故默认输出不含该字样。这是用户主动要求的行为（先设为默认勾选、后要求改为不勾）。如需合规输出由用户手动勾选，或在被明确要求时再改默认值——改默认值务必同步修正 `_selftest.html` 的期望值。

## 测试注意事项

`test.js` 共 64 项断言，分五组，新增用例请归入对应数组：

| 数组 | 数量 | 覆盖 |
| --- | --- | --- |
| `cases` | 43 | 整数零、拾/佰/仟/万/亿各级单位、零的合并、角分组合、20 位上限、负数 |
| `optionCases` | 3 | `prefix` / `suffix` 选项 |
| `badInputs` | 9 | 非法输入必须被拒绝 |
| `fmtCases` | 4 | `formatAmount` 千分位 |
| `tolerance` | 5 | 千分位、`￥`、全角、number 入参、首尾空格 |

## 部署（GitHub Pages）

已部署至 GitHub Pages，仓库 `williechen0746/rmb-uppercase-converter`（公开）：

- 线上地址：`https://williechen0746.github.io/rmb-uppercase-converter/`
- 来源：`main` 分支根目录（`build_type: legacy`），已强制 HTTPS

纯静态、无构建，因此**推送到 `main` 即自动发布**，无需任何 CI 配置。

### 关键陷阱：`.nojekyll` 不可删除

GitHub Pages 默认启用 Jekyll，而 **Jekyll 会忽略所有以 `_` 开头的文件**。本项目的 `_selftest.html` 因此返回 404——**在本地与 `python3 -m http.server` 下却完全正常，极易漏掉**。

仓库根目录的空文件 `.nojekyll` 就是用来关闭 Jekyll 的，**必须保留**。今后新增任何 `_` 开头的文件，都要确认该文件仍在，并实地访问新文件确认为 200。

### 发布后须实地核验（本次实际踩到）

首次构建完成、`curl` 已返回 200 之后，CDN 边缘节点仍可能残留短暂不一致：本次本地核验时曾出现自检页加载 `rmb-upper.js` 失败（`window.RMBUpper` 为 `undefined`、断言报 `Cannot read properties of undefined`），**约一分钟后自愈，重跑即 5/5 PASS**。因此发布后若遇到偶发资源加载失败，**先等待并重试再判定为缺陷**，不要急着改代码。

### 发布核验清单

```bash
B=https://williechen0746.github.io/rmb-uppercase-converter
for f in / /index.html /rmb-upper.js /_selftest.html; do
  printf '%-18s -> %s\n' "$f" "$(curl -s -o /dev/null -w '%{http_code}' "$B$f")"
done
```

再于浏览器打开 `$B/_selftest.html`，确认 `window.__SELFTEST__` 全部为 PASS。

### 版本控制约定

`.workbuddy/`（工作记录与缓存）已写入 `.gitignore`，**不进入版本库、不随公开仓库发布**。涉及内部流程或个人偏好的内容请留在该目录内，不要提交到仓库。

## 搜索优化（SEO）配置

页面内容全部写在 HTML 里、不依赖 JS 渲染，可被爬虫正常抓取。已配置项：

- **`<title>`**——含核心检索词「人民币大写转换」「小写金额转中文大写」。
- **`meta description` / `keywords`**——描述内含具体示例（`1234.56` → …），便于生成摘要。
- **`link rel="canonical"`**——指向 `https://williechen0746.github.io/rmb-uppercase-converter/`。**一旦更换域名或仓库名，此处必须同步更新**，否则会指向错误地址。
- **JSON-LD**——`WebApplication` 结构化数据。改动后须用 `JSON.parse` 校验语法，避免整块失效。
- **Open Graph / Twitter Card**——`og:image` 指向 `og-image.png`（1200×630），`twitter:card` 为 `summary_large_image`。
- 另有 `favicon.svg`、`sitemap.xml`、明暗两套 `theme-color`、`hreflang`。

### 两个容易忽略的点

1. **项目型 Pages 站点上的 `robots.txt` 无效。** 爬虫只读取主机根的 `https://williechen0746.github.io/robots.txt`，仓库内的 `<repo>/robots.txt` 不会被读取。本项目因此**不放 robots.txt**，改用页面内 `<meta name="robots">` 控制收录。
2. **`_selftest.html` 已注入 `noindex, nofollow`。** 它是 `index.html` 的近似重复页，不应被收录。该 meta 不能写在 `index.html` 里（会被同步脚本一并带过去），只能由同步脚本在生成副本时插入——**重跑同步必须包含这一步**，否则副本会重新变成可索引页。

### 同步脚本（含 noindex 注入，取代上文简版）

```python
import io
idx = io.open('index.html', encoding='utf-8').read()
sel = io.open('_selftest.html', encoding='utf-8').read()
tail = '</body>\n</html>\n'
block = sel[sel.rindex('\n<script>\n') + 1:]          # 末尾自检块，原样保留
new = idx[:-len(tail)] + '\n' + block
a = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
new = new.replace(a, a + '<meta name="robots" content="noindex, nofollow">\n', 1)
io.open('_selftest.html', 'w', encoding='utf-8').write(new)
```

校验：去掉该注入行后，副本应以「`index.html` 去掉结尾 tail」为前缀，且 `noindex` 在副本中只出现 1 次、在主页面中为 0 次。

## 面向 AI / 大模型的收录优化

站点同时面向搜索引擎与大模型检索做了配置。页面可见正文从约 315 字提升到约 1089 字——**这是对 AI 引用最实质的一项**，因为引用需要清晰、自足的事实陈述句，而非界面标签。

### 已做的四件事

1. **可见正文板块**（`index.html`）：「关于本工具」（用途、隐私、支持范围、开源出处）与「常见问题」（5 组问答），均配合 `.prose` / `.faq` 样式，沿用既有卡片风格。
2. **`llms.txt`**：按新兴约定提供面向大模型的站点摘要、规则依据与常见问答。
3. **权威性信号**（`WebApplication` JSON-LD）：`author` / `publisher` / `datePublished` / `dateModified` / `codeRepository` / `sameAs` / `isBasedOn`（指向法规原文），另有 `<meta name="author">`。
4. **`FAQPage` JSON-LD**：5 组问答，与页面可见问答一一对应。

### 三条硬约束

1. **`FAQPage` 的问答文字必须与可见内容逐字一致。** 结构化数据描述页面上不存在的内容属误导性标记，会招致惩罚。**修改可见 FAQ 时，必须同步改 JSON-LD**；反之亦然。校验方式是去掉全部空白字符后逐条比对（仅空白差异可接受，字符差异不可）。
2. **法规条款序号以 cncc.cn 为准，不要照抄其他来源。** 该附录在不同转载页上的编号并不一致（税屋版有重复的「五」）。已核准的 cncc 编号：**第二条**＝整/正 的用法，**第三条**＝「人民币」字样，**第四条（三）**＝万位或元位是 0 时零的写法。页面与 FAQ 中的引用按此书写。
3. **`llms.txt` 不是决定性手段。** 它是 2024 年提出的约定，OpenAI / Anthropic / Google 均未公开确认将其作为检索要求，实际采用度有限。不要向用户把它说成能保证被收录。

### 认知边界（如实告知用户）

- AI 答案的检索增强主要走搜索引擎索引（ChatGPT / Copilot 依赖 Bing），**「先被 Google / Bing 收录」仍是前提**；`llms.txt` 不能替代 Search Console / Bing 站长工具提交。
- 能否被引用，**外部信号（被其他网站引用、提及）的影响大于页面内标签**。标签只决定「机器读得懂」，不决定「被信任」。
- 项目型 Pages 站点**无法通过 `robots.txt` 限制 AI 爬虫**——只有主机根 `https://williechen0746.github.io/robots.txt` 会被读取，而该位置由 GitHub 控制。若确需屏蔽，只能改用自定义域名或用户型站点（以 `williechen0746.github.io` 作为仓库名）。
