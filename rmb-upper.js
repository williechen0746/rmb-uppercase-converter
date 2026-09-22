/**
 * 人民币金额小写 -> 大写（财务规范写法）
 *
 * 依据中国人民银行《正确填写票据和结算凭证的基本规定》：
 *   - 汉字大写：零壹贰叁肆伍陆柒捌玖 拾佰仟万亿 元角分整
 *   - 金额到“元”为止的，元后写“整”；到“角”为止的，角后可写“整”；
 *     有“分”的，分后不写“整”。
 *   - 阿拉伯数字中间有“0”时，中文大写要写“零”；连续几个“0”只写一个“零”。
 *
 * 全程使用字符串运算，避免浮点误差（0.1 + 0.2 !== 0.3 之类）。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RMBUpper = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DIGITS = '零壹贰叁肆伍陆柒捌玖';
  var UNITS = ['', '拾', '佰', '仟'];
  var BIG_UNITS = ['', '万', '亿', '万亿', '亿亿'];
  // 支持到 20 位整数（亿亿级），实际按 4 位一组分组
  var MAX_INT_DIGITS = 20;

  /** 把一段（1~4 位）的数字转成大写，例如 "0011" -> "壹拾壹" */
  function groupToUpper(group) {
    var out = '';
    var pendingZero = false;
    var len = group.length;
    for (var i = 0; i < len; i++) {
      var d = group.charCodeAt(i) - 48;
      var unit = UNITS[len - 1 - i];
      if (d === 0) {
        pendingZero = true;
      } else {
        if (pendingZero && out !== '') out += '零';
        pendingZero = false;
        out += DIGITS.charAt(d) + unit;
      }
    }
    return out;
  }

  /** 整数部分：纯数字字符串 -> 大写（不含“元”） */
  function intToUpper(intStr) {
    intStr = intStr.replace(/^0+/, '');
    if (intStr === '') return '';

    var pad = (4 - (intStr.length % 4)) % 4;
    if (pad) intStr = new Array(pad + 1).join('0') + intStr;

    var groups = [];
    for (var i = 0; i < intStr.length; i += 4) groups.push(intStr.substr(i, 4));

    var n = groups.length;
    var out = '';
    var pendingZero = false;

    for (var g = 0; g < n; g++) {
      var seg = groups[g];
      var bigUnit = BIG_UNITS[n - 1 - g] || '';
      if (/^0+$/.test(seg)) {
        // 整节为零：只记一个待补的“零”，节权位直接丢弃
        pendingZero = true;
        continue;
      }
      if (out !== '' && (pendingZero || seg.charAt(0) === '0')) out += '零';
      out += groupToUpper(seg) + bigUnit;
      pendingZero = false;
    }
    return out;
  }

  /**
   * 校验并规整输入。
   * 返回 {ok:true, neg, int, dec} 或 {ok:false, message}
   */
  function parseAmount(input) {
    if (input === null || input === undefined) return { ok: false, message: '请输入金额' };
    var s = String(input).trim();
    if (s === '') return { ok: false, message: '请输入金额' };

    // 去掉千分位、全角数字、货币符号、空格
    s = s.replace(/[￥¥,，\s]/g, '').replace(/[０-９．－]/g, function (c) {
      return c === '．' ? '.' : c === '－' ? '-' : String.fromCharCode(c.charCodeAt(0) - 0xfee0);
    });
    if (s.charAt(0) === '＋' || s.charAt(0) === '+') s = s.slice(1);

    var neg = false;
    if (s.charAt(0) === '-') {
      neg = true;
      s = s.slice(1);
    }

    if (!/^\d*(\.\d*)?$/.test(s) || s === '.' || s === '') {
      return { ok: false, message: '请输入有效的数字' };
    }

    var parts = s.split('.');
    var intPart = parts[0] || '0';
    var decPart = parts[1] || '';

    if (decPart.length > 2) {
      return { ok: false, message: '金额最多保留 2 位小数（分）' };
    }
    intPart = intPart.replace(/^0+(?=\d)/, '');
    if (intPart.length > MAX_INT_DIGITS) {
      return { ok: false, message: '金额过大，最多支持 ' + MAX_INT_DIGITS + ' 位整数' };
    }

    decPart = (decPart + '00').slice(0, 2);
    return { ok: true, neg: neg, int: intPart, dec: decPart };
  }

  /**
   * 主函数：数字/字符串 -> 人民币大写
   * @param {string|number} input
   * @param {{prefix?:boolean, suffix?:'整'|'正'|'', zeroYuan?:boolean}} [options]
   *   prefix   是否加“人民币”前缀，默认 true
   *   suffix   元后整字，默认“整”
   *   zeroYuan 整数部分为 0 时是否写“零元”，默认 true
   * @returns {string}
   */
  function toUpper(input, options) {
    var opt = options || {};
    var prefix = opt.prefix !== false;
    var suffix = opt.suffix === undefined ? '整' : opt.suffix;
    var zeroYuan = opt.zeroYuan !== false;

    var r = parseAmount(input);
    if (!r.ok) return '';

    var jiao = r.dec.charCodeAt(0) - 48;
    var fen = r.dec.charCodeAt(1) - 48;
    var intUpper = intToUpper(r.int);

    var body = '';
    if (intUpper === '' && jiao === 0 && fen === 0) {
      body = '零元' + suffix;
    } else {
      // 整数部分
      if (intUpper === '') {
        if (zeroYuan) body = '零元';
      } else {
        body = intUpper + '元';
      }
      // 角分
      if (jiao === 0 && fen === 0) {
        body += suffix;
      } else if (jiao === 0 && fen > 0) {
        body += '零' + DIGITS.charAt(fen) + '分';
      } else if (jiao > 0 && fen === 0) {
        body += DIGITS.charAt(jiao) + '角' + suffix;
      } else {
        body += DIGITS.charAt(jiao) + '角' + DIGITS.charAt(fen) + '分';
      }
    }

    return (prefix ? '人民币' : '') + (r.neg ? '负' : '') + body;
  }

  /** 只做校验，方便 UI 显示错误信息 */
  function validate(input) {
    return parseAmount(input);
  }

  /** 数字 -> 带千分位的显示串，如 1234567.5 -> 1,234,567.50 */
  function formatAmount(input) {
    var r = parseAmount(input);
    if (!r.ok) return '';
    var intWithSep = r.int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (r.neg ? '-' : '') + intWithSep + (r.dec === '00' ? '' : '.' + r.dec);
  }

  return {
    toUpper: toUpper,
    validate: validate,
    formatAmount: formatAmount,
    parseAmount: parseAmount,
    intToUpper: intToUpper,
    groupToUpper: groupToUpper,
    BIG_UNITS: BIG_UNITS,
    DIGITS: DIGITS,
    MAX_INT_DIGITS: MAX_INT_DIGITS
  };
});
