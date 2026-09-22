/**
 * 核心转换逻辑测试：node test.js
 */
const RMB = require('./rmb-upper.js');

// [输入, 期望输出]
const cases = [
  ['0', '人民币零元整'],
  ['0.00', '人民币零元整'],
  ['1', '人民币壹元整'],
  ['10', '人民币壹拾元整'],
  ['11', '人民币壹拾壹元整'],
  ['100', '人民币壹佰元整'],
  ['101', '人民币壹佰零壹元整'],
  ['110', '人民币壹佰壹拾元整'],
  ['1000', '人民币壹仟元整'],
  ['1001', '人民币壹仟零壹元整'],
  ['1010', '人民币壹仟零壹拾元整'],
  ['1100', '人民币壹仟壹佰元整'],
  ['10000', '人民币壹万元整'],
  ['10001', '人民币壹万零壹元整'],
  ['10010', '人民币壹万零壹拾元整'],
  ['10100', '人民币壹万零壹佰元整'],
  ['11000', '人民币壹万壹仟元整'],
  ['100000', '人民币壹拾万元整'],
  ['1000000', '人民币壹佰万元整'],
  ['10000000', '人民币壹仟万元整'],
  ['100000000', '人民币壹亿元整'],
  ['100000001', '人民币壹亿零壹元整'],
  ['100010000', '人民币壹亿零壹万元整'],
  ['110000000', '人民币壹亿壹仟万元整'],
  ['1000000000', '人民币壹拾亿元整'],
  ['1000000000000', '人民币壹万亿元整'],
  ['123456789', '人民币壹亿贰仟叁佰肆拾伍万陆仟柒佰捌拾玖元整'],
  ['20000000000000000000', '人民币贰仟亿亿元整'],
  ['0.5', '人民币零元伍角整'],
  ['0.05', '人民币零元零伍分'],
  ['0.55', '人民币零元伍角伍分'],
  ['1.5', '人民币壹元伍角整'],
  ['1.05', '人民币壹元零伍分'],
  ['1.55', '人民币壹元伍角伍分'],
  ['10.05', '人民币壹拾元零伍分'],
  ['100.5', '人民币壹佰元伍角整'],
  ['1000.01', '人民币壹仟元零壹分'],
  ['205.30', '人民币贰佰零伍元叁角整'],
  ['1234.56', '人民币壹仟贰佰叁拾肆元伍角陆分'],
  ['10000.01', '人民币壹万元零壹分'],
  ['100000000.01', '人民币壹亿元零壹分'],
  ['1234567.89', '人民币壹佰贰拾叁万肆仟伍佰陆拾柒元捌角玖分'],
  ['-100', '人民币负壹佰元整'],
];

let pass = 0;
const fails = [];
for (const [input, expected] of cases) {
  const actual = RMB.toUpper(input);
  if (actual === expected) pass++;
  else fails.push({ input, expected, actual });
}

// 选项测试
const optionCases = [
  [() => RMB.toUpper('100', { prefix: false }), '壹佰元整', '去掉人民币前缀'],
  [() => RMB.toUpper('100', { suffix: '正' }), '人民币壹佰元整'.replace('整', '正'), '整->正'],
  [() => RMB.toUpper('1.05', { suffix: '' }), '人民币壹元零伍分', '有分不加整'],
];
for (const [fn, expected, name] of optionCases) {
  let actual;
  try { actual = fn(); } catch (e) { actual = 'THREW ' + e.message; }
  if (actual === expected) pass++;
  else fails.push({ input: name, expected, actual });
}

// 校验测试：这些输入应当被拒绝
const badInputs = ['', 'abc', '1.234', '1..2', '--1', '1.2.3', null, undefined, '.'];
for (const bad of badInputs) {
  const v = RMB.validate(bad);
  if (!v.ok) pass++;
  else fails.push({ input: String(bad), expected: '拒绝', actual: '接受了' });
}

// 格式化
const fmtCases = [
  ['1234567.5', '1,234,567.50'],
  ['1000', '1,000'],
  ['0.05', '0.05'],
  ['-1234.5', '-1,234.50'],
];
for (const [input, expected] of fmtCases) {
  const actual = RMB.formatAmount(input);
  if (actual === expected) pass++;
  else fails.push({ input: 'format ' + input, expected, actual });
}

// 千分位/全角输入也能识别
const tolerance = [
  ['1,234.56', '人民币壹仟贰佰叁拾肆元伍角陆分'],
  ['￥100', '人民币壹佰元整'],
  ['１２３', '人民币壹佰贰拾叁元整'],
  [123.45, '人民币壹佰贰拾叁元肆角伍分'],
  [' 99.9 ', '人民币玖拾玖元玖角整'],
];
for (const [input, expected] of tolerance) {
  const actual = RMB.toUpper(input);
  if (actual === expected) pass++;
  else fails.push({ input: JSON.stringify(input), expected, actual });
}

if (fails.length) {
  console.log('❌ 失败 ' + fails.length + ' 项：');
  for (const f of fails) {
    console.log('  输入: ' + JSON.stringify(f.input));
    console.log('    期望: ' + f.expected);
    console.log('    实际: ' + f.actual);
  }
  process.exit(1);
} else {
  console.log('✅ 全部 ' + pass + ' 项断言通过');
}
