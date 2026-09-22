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

校验同步是否成立：`_selftest.html` 应以「`index.html` 去掉结尾 tail」为前缀。注意行号（如"前 N 行相同"）会随改动漂移，不要把它当判据。

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
