// ZIR: runs the LLVM IR (text) that zevic writes, inside the page.
//
// The IR is translated into JavaScript functions. Memory is the linear memory of the runtime
// (runtime.wasm, the C runtime of zevic built for wasm32-wasi), so strings, arrays and maps made by
// the generated code and by the runtime see the same bytes. Values: iN (N <= 32) are numbers in
// their signed form, i64 is a number when it fits in 53 bits and a BigInt when it does not (never both for
// one value), ptr is a number (an address), float and double are numbers,
// structs and arrays are JavaScript arrays.
//
// Only what zevic emits is understood: load, store, alloca, getelementptr, the integer and float
// operations, casts, select, phi, call, br, switch, ret, unreachable, extractvalue, insertvalue.
(function (root) {
  'use strict';

  // ---- types ----
  function parseType(s, i) {
    while (s[i] === ' ') i++;
    var c = s[i], m;
    if (c === '{') {
      var elems = []; i++;
      while (true) {
        while (s[i] === ' ') i++;
        if (s[i] === '}') { i++; break; }
        var r = parseType(s, i); elems.push(r[0]); i = r[1];
        while (s[i] === ' ') i++;
        if (s[i] === ',') i++;
      }
      return [{ k: 'struct', elems: elems }, i];
    }
    if (c === '[') {
      var m2 = /^\[\s*(\d+)\s+x\s+/.exec(s.slice(i));
      if (!m2) throw new Error('bad array type: ' + s.slice(i, i + 30));
      i += m2[0].length;
      var r2 = parseType(s, i); i = r2[1];
      while (s[i] === ' ') i++;
      if (s[i] !== ']') throw new Error('bad array type');
      return [{ k: 'array', n: +m2[1], elem: r2[0] }, i + 1];
    }
    m = /^(i(\d+)|float|double|ptr|void)\b/.exec(s.slice(i));
    if (!m) throw new Error('unknown type near: ' + s.slice(i, i + 30));
    i += m[0].length;
    if (m[2]) return [{ k: 'int', bits: +m[2] }, i];
    if (m[1] === 'float') return [{ k: 'float' }, i];
    if (m[1] === 'double') return [{ k: 'double' }, i];
    if (m[1] === 'ptr') return [{ k: 'ptr' }, i];
    return [{ k: 'void' }, i];
  }
  function tyOf(s) { return parseType(s, 0)[0]; }

  function sizeOf(t) {
    if (t.size !== undefined) return t.size;
    var r;
    switch (t.k) {
      case 'int': r = t.bits <= 8 ? 1 : t.bits <= 16 ? 2 : t.bits <= 32 ? 4 : 8; break;
      case 'float': r = 4; break;
      case 'double': r = 8; break;
      case 'ptr': r = 4; break;
      case 'array': r = t.n * sizeOf(t.elem); break;
      case 'struct': {
        var o = 0, a = 1;
        t.offs = [];
        t.elems.forEach(function (e) {
          var ea = alignOf(e); o = Math.ceil(o / ea) * ea; t.offs.push(o); o += sizeOf(e); if (ea > a) a = ea;
        });
        r = Math.ceil(o / a) * a; break;
      }
      default: r = 0;
    }
    t.size = r; return r;
  }
  function alignOf(t) {
    if (t.align !== undefined) return t.align;
    var r;
    switch (t.k) {
      case 'array': r = alignOf(t.elem); break;
      case 'struct': r = 1; t.elems.forEach(function (e) { r = Math.max(r, alignOf(e)); }); break;
      default: r = Math.max(1, sizeOf(t));
    }
    t.align = r; return r;
  }
  function fieldOff(t, i) { sizeOf(t); return t.offs[i]; }

  // ---- text helpers ----
  function splitTop(s) {
    var out = [], d = 0, q = false, st = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) { if (c === '"') q = false; continue; }
      if (c === '"') q = true;
      else if (c === '{' || c === '[' || c === '(') d++;
      else if (c === '}' || c === ']' || c === ')') d--;
      else if (c === ',' && d === 0) { out.push(s.slice(st, i).trim()); st = i + 1; }
    }
    var last = s.slice(st).trim();
    if (last !== '' || out.length) out.push(last);
    return out;
  }
  function unq(n) { // @"a b" -> a b ; @x -> x
    n = n.slice(1);
    return n[0] === '"' ? n.slice(1, -1) : n;
  }
  var NAME = '[%@](?:"[^"]*"|[\\w.$-]+)';
  function mangle(n) { return 'v_' + unq(n).replace(/[^A-Za-z0-9_]/g, function (c) { return '$' + c.charCodeAt(0).toString(16); }); }

  function cString(body) { // c"..." with \XX escapes
    var bytes = [];
    for (var i = 0; i < body.length; i++) {
      if (body[i] === '\\') {
        if (body[i + 1] === '\\') { bytes.push(92); i++; }
        else { bytes.push(parseInt(body.substr(i + 1, 2), 16)); i += 2; }
      } else bytes.push(body.charCodeAt(i) & 255);
    }
    return bytes;
  }

  function dflt(t) {
    switch (t.k) {
      case 'int': return '0';
      case 'struct': return '[' + t.elems.map(dflt).join(',') + ']';
      case 'array': { var a = []; for (var i = 0; i < t.n; i++) a.push(dflt(t.elem)); return '[' + a.join(',') + ']'; }
      default: return '0';
    }
  }

  // ---- parsing the module ----
  function parseModule(text) {
    var mod = { globals: {}, funcs: {}, decls: {}, order: [] };
    var lines = text.split('\n'), i = 0;
    while (i < lines.length) {
      var ln = lines[i++];
      if (ln === '' || ln[0] === ';' || /^source_filename|^target /.test(ln)) continue;
      var m;
      if (ln[0] === '@') {
        m = new RegExp('^(' + NAME + ') = [a-z_ ]*?(?:constant|global) (.*)$').exec(ln);
        if (!m) throw new Error('unsupported global: ' + ln.slice(0, 80));
        var rest = m[2], r = parseType(rest, 0), t = r[0], v = rest.slice(r[1]).trim(), mm;
        var g = { name: unq(m[1]), type: t, bytes: null };
        if ((mm = /^c"(.*)"/.exec(v))) g.bytes = cString(mm[1]);
        else if (v === 'zeroinitializer') g.bytes = new Array(sizeOf(t)).fill(0);
        else g.init = v;
        mod.globals[g.name] = g;
      } else if (ln.indexOf('declare ') === 0) {
        m = new RegExp('^declare\\s+(?:[a-z_]+\\s+)*(.*?)\\s+(' + NAME + ')\\((.*)\\)').exec(ln);
        if (!m) throw new Error('bad declare: ' + ln);
        mod.decls[unq(m[2])] = { ret: tyOf(m[1]), params: m[3].trim() === '' ? [] : splitTop(m[3]).filter(function (p) { return p !== '...'; }).map(function (p) { return tyOf(p); }) };
      } else if (ln.indexOf('define ') === 0) {
        m = new RegExp('^define\\s+(?:[a-z_]+\\s+)*?(.*?)\\s+(' + NAME + ')\\((.*)\\)[^)]*\\{\\s*$').exec(ln);
        if (!m) throw new Error('bad define: ' + ln);
        var f = { name: unq(m[2]), ret: tyOf(m[1]), params: [], lines: [] };
        splitTop(m[3]).forEach(function (p) {
          if (p === '') return;
          var pr = parseType(p, 0);
          var nm = /(%[\w.$-]+|%"[^"]*")/.exec(p.slice(pr[1]));
          f.params.push({ type: pr[0], name: nm[1] });
        });
        while (i < lines.length && lines[i] !== '}') {
          var l = lines[i++];
          if (/^\s*switch\b/.test(l)) { while (l.indexOf(']') < 0) l += ' ' + lines[i++].trim(); }
          var semi = l.indexOf(';'); if (semi >= 0 && l.indexOf('"') < 0) l = l.slice(0, semi);
          l = l.trim();
          if (l !== '') f.lines.push(l);
        }
        i++;
        mod.funcs[f.name] = f; mod.order.push(f.name);
      } else if (/^\s*$/.test(ln) || ln[0] === '!' || ln.indexOf('attributes') === 0) {
        continue;
      } else {
        throw new Error('unsupported line: ' + ln.slice(0, 80));
      }
    }
    return mod;
  }

  // ---- i64: a number when |v| < 2^53, a BigInt otherwise (so === and the order operators just work) ----
  var MAXS = 9007199254740991, MAXSB = 9007199254740991n;
  function NORM(x) { return (x >= -MAXSB && x <= MAXSB) ? Number(x) : x; }
  function BIG(x) { return typeof x === 'bigint' ? x : BigInt(x); }
  var asI = BigInt.asIntN, asU = BigInt.asUintN;
  var H64 = {
    NORM: NORM,
    A64: function (a, b) { if (typeof a === 'number' && typeof b === 'number') { var r = a + b; if (r <= MAXS && r >= -MAXS) return r; } return NORM(asI(64, BIG(a) + BIG(b))); },
    S64: function (a, b) { if (typeof a === 'number' && typeof b === 'number') { var r = a - b; if (r <= MAXS && r >= -MAXS) return r; } return NORM(asI(64, BIG(a) - BIG(b))); },
    M64: function (a, b) { if (typeof a === 'number' && typeof b === 'number') { var r = a * b; if (r <= MAXS && r >= -MAXS) return r + 0; } return NORM(asI(64, BIG(a) * BIG(b))); },
    D64: function (a, b) {
      if (typeof a === 'number' && typeof b === 'number') { if (b === 0) throw new RangeError('Division by zero'); return (a - a % b) / b + 0; }
      return NORM(asI(64, BIG(a) / BIG(b)));
    },
    R64: function (a, b) {
      if (typeof a === 'number' && typeof b === 'number') { if (b === 0) throw new RangeError('Division by zero'); return a % b + 0; }
      return NORM(BIG(a) % BIG(b));
    },
    UD64: function (a, b) { return NORM(asI(64, asU(64, BIG(a)) / asU(64, BIG(b)))); },
    UR64: function (a, b) { return NORM(asI(64, asU(64, BIG(a)) % asU(64, BIG(b)))); },
    AND64: function (a, b) { if (typeof a === 'number' && typeof b === 'number' && (a | 0) === a && (b | 0) === b) return a & b; return NORM(asI(64, BIG(a) & BIG(b))); },
    OR64: function (a, b) { if (typeof a === 'number' && typeof b === 'number' && (a | 0) === a && (b | 0) === b) return a | b; return NORM(asI(64, BIG(a) | BIG(b))); },
    XOR64: function (a, b) { if (typeof a === 'number' && typeof b === 'number' && (a | 0) === a && (b | 0) === b) return a ^ b; return NORM(asI(64, BIG(a) ^ BIG(b))); },
    SHL64: function (a, b) { b = Number(b); if (typeof a === 'number' && b < 31) { var r = a * (1 << b); if (r <= MAXS && r >= -MAXS) return r; } return NORM(asI(64, BIG(a) << BigInt(b))); },
    LSHR64: function (a, b) { b = Number(b); if (typeof a === 'number' && a >= 0) return Math.floor(a / Math.pow(2, b)); return NORM(asI(64, asU(64, BIG(a)) >> BigInt(b))); },
    ASHR64: function (a, b) { b = Number(b); if (typeof a === 'number') return Math.floor(a / Math.pow(2, b)); return NORM(BIG(a) >> BigInt(b)); },
    UCMP: function (a, b) { var x = asU(64, BIG(a)), y = asU(64, BIG(b)); return x < y ? -1 : x > y ? 1 : 0; },
    T64: function (v, bits) {
      if (typeof v === 'number') return bits === 32 ? v | 0 : bits === 16 ? (v << 16) >> 16 : bits === 8 ? (v << 24) >> 24 : v & 1;
      return bits === 1 ? Number(v & 1n) : Number(asI(bits, v));
    },
    F2I64: function (x) {
      if (x !== x) return 0;
      x = Math.trunc(x);
      if (x <= MAXS && x >= -MAXS) return x + 0;
      if (x >= 9223372036854775808) return 9223372036854775807n;
      if (x <= -9223372036854775808) return -9223372036854775808n;
      return NORM(BigInt(x));
    },
    U2F64: function (v) { return v >= 0 ? Number(v) : Number(asU(64, BIG(v))); },
    P64: function (v) { return typeof v === 'number' ? v >>> 0 : Number(asU(32, v)); },
    OA64: function (a, b) {
      if (typeof a === 'number' && typeof b === 'number') { var r = a + b; if (r <= MAXS && r >= -MAXS) return [r, 0]; }
      var x = BIG(a) + BIG(b), w = asI(64, x); return [NORM(w), w !== x ? 1 : 0];
    },
    OS64: function (a, b) {
      if (typeof a === 'number' && typeof b === 'number') { var r = a - b; if (r <= MAXS && r >= -MAXS) return [r, 0]; }
      var x = BIG(a) - BIG(b), w = asI(64, x); return [NORM(w), w !== x ? 1 : 0];
    },
    OM64: function (a, b) {
      if (typeof a === 'number' && typeof b === 'number') { var r = a * b; if (r <= MAXS && r >= -MAXS) return [r + 0, 0]; }
      var x = BIG(a) * BIG(b), w = asI(64, x); return [NORM(w), w !== x ? 1 : 0];
    }
  };
  function lit64(tok) { var n = BigInt(tok); return (n >= -MAXSB && n <= MAXSB) ? String(n) : n + 'n'; }

  // ---- code generation ----
  var UNS = function (bits, x) { return bits === 64 ? 'BigInt.asUintN(64,BigInt(' + x + '))' : bits === 32 ? '(' + x + '>>>0)' : bits === 16 ? '(' + x + '&65535)' : bits === 8 ? '(' + x + '&255)' : x; };
  var WRAP = function (bits, e) { return bits === 64 ? 'BigInt.asIntN(64,' + e + ')' : bits === 32 ? '((' + e + ')|0)' : bits === 16 ? '((' + e + ')<<16>>16)' : bits === 8 ? '((' + e + ')<<24>>24)' : '((' + e + ')&1)'; };

  function genModule(mod, env) {
    var types = []; // runtime table of aggregate types for LD / ST
    function tid(t) { var i = types.indexOf(t); if (i < 0) { i = types.length; types.push(t); } return i; }
    var exts = {}, extList = []; // externs, resolved once: X0, X1, ...
    function extRef(name, rt) {
      var k = name + '|' + tid(rt);
      if (!exts[k]) { exts[k] = 'X' + extList.length; extList.push(exts[k] + '=EX(' + JSON.stringify(name) + ',' + tid(rt) + ')'); }
      return exts[k];
    }
    var fid = {}; // function name -> id (a pointer value for `ptr @f`)
    var ids = [];
    mod.order.forEach(function (n) { fid[n] = 0x100000 + ids.length * 4; ids.push(n); });

    function ld(t, a) {
      switch (t.k) {
        case 'int': return t.bits === 1 ? '(D.getUint8(' + a + ')&1)' : t.bits === 8 ? 'D.getInt8(' + a + ')' : t.bits === 16 ? 'D.getInt16(' + a + ',true)' : t.bits === 32 ? 'D.getInt32(' + a + ',true)' : 'LD64(' + a + ')';
        case 'float': return 'D.getFloat32(' + a + ',true)';
        case 'double': return 'D.getFloat64(' + a + ',true)';
        case 'ptr': return 'D.getUint32(' + a + ',true)';
        default: return 'LD(' + tid(t) + ',' + a + ')';
      }
    }
    function st(t, a, v) {
      switch (t.k) {
        case 'int': return t.bits <= 8 ? 'D.setInt8(' + a + ',' + v + ')' : t.bits === 16 ? 'D.setInt16(' + a + ',' + v + ',true)' : t.bits === 32 ? 'D.setInt32(' + a + ',' + v + ',true)' : 'ST64(' + a + ',' + v + ')';
        case 'float': return 'D.setFloat32(' + a + ',' + v + ',true)';
        case 'double': return 'D.setFloat64(' + a + ',' + v + ',true)';
        case 'ptr': return 'D.setUint32(' + a + ',' + v + ',true)';
        default: return 'ST(' + tid(t) + ',' + a + ',' + v + ')';
      }
    }

    // a constant or a local as a JS expression
    function val(tok, t) {
      tok = tok.trim();
      var m;
      if (tok[0] === '%') return mangle(tok);
      if (tok[0] === '@') {
        var n = unq(tok);
        if (mod.globals[n]) return String(mod.globals[n].addr);
        if (fid[n] !== undefined) return String(fid[n]);
        if (mod.decls[n]) return String(env.externId(n));
        throw new Error('unknown global ' + n);
      }
      if (tok === 'null') return '0';
      if (tok === 'true') return '1';
      if (tok === 'false') return '0';
      if (tok === 'undef' || tok === 'poison' || tok === 'zeroinitializer') return dflt(t);
      if (tok[0] === '{') {
        var parts = splitTop(tok.slice(1, -1));
        return '[' + parts.map(function (p, i) { var r = parseType(p, 0); return val(p.slice(r[1]), r[0]); }).join(',') + ']';
      }
      if (tok[0] === '[') {
        var ps = splitTop(tok.slice(1, -1));
        return '[' + ps.map(function (p) { var r = parseType(p, 0); return val(p.slice(r[1]), r[0]); }).join(',') + ']';
      }
      if (t.k === 'int') {
        if (!/^-?\d+$/.test(tok)) throw new Error('bad integer ' + tok);
        return t.bits === 64 ? lit64(tok) : tok;
      }
      if (t.k === 'float' || t.k === 'double') {
        if (/^0x[0-9A-Fa-f]+$/.test(tok)) return 'HEXD("' + tok.slice(2) + '")';
        return /^-?\d/.test(tok) ? String(Number(tok)) : tok;
      }
      throw new Error('cannot read operand ' + tok);
    }

    function binop(op, t, a, b) {
      var bits = t.bits, fl = t.k === 'float';
      if (t.k === 'float' || t.k === 'double') {
        var e = { fadd: a + '+' + b, fsub: a + '-' + b, fmul: a + '*' + b, fdiv: a + '/' + b, frem: a + '%' + b }[op];
        if (!e) throw new Error('unsupported ' + op);
        return fl ? 'Math.fround(' + e + ')' : '(' + e + ')';
      }
      if (bits === 64) {
        var h = { add: 'A64', sub: 'S64', mul: 'M64', sdiv: 'D64', srem: 'R64', udiv: 'UD64', urem: 'UR64', and: 'AND64', or: 'OR64', xor: 'XOR64', shl: 'SHL64', lshr: 'LSHR64', ashr: 'ASHR64' }[op];
        if (h) return h + '(' + a + ',' + b + ')';
      }
      switch (op) {
        case 'add': return WRAP(bits, a + '+' + b);
        case 'sub': return WRAP(bits, a + '-' + b);
        case 'mul': return bits === 32 ? 'Math.imul(' + a + ',' + b + ')' : WRAP(bits, a + '*' + b);
        case 'sdiv': return bits === 64 ? WRAP(64, a + '/' + b) : WRAP(bits, 'Math.trunc(' + a + '/' + b + ')');
        case 'srem': return '(' + a + '%' + b + ')';
        case 'udiv': return bits === 64 ? WRAP(64, UNS(64, a) + '/' + UNS(64, b)) : WRAP(bits, 'Math.trunc(' + UNS(bits, a) + '/' + UNS(bits, b) + ')');
        case 'urem': return bits === 64 ? WRAP(64, UNS(64, a) + '%' + UNS(64, b)) : WRAP(bits, UNS(bits, a) + '%' + UNS(bits, b));
        case 'and': return '(' + a + '&' + b + ')';
        case 'or': return '(' + a + '|' + b + ')';
        case 'xor': return '(' + a + '^' + b + ')';
        case 'shl': return WRAP(bits, a + '<<' + b);
        case 'lshr': return bits === 64 ? WRAP(64, UNS(64, a) + '>>' + b) : WRAP(bits, UNS(bits, a) + '>>>' + b);
        case 'ashr': return '(' + a + '>>' + b + ')';
      }
      throw new Error('unsupported op ' + op);
    }

    function icmp(pred, t, a, b) {
      var bits = t.k === 'ptr' ? 32 : t.bits, u = pred[0] === 'u';
      var o = { eq: '===', ne: '!==', slt: '<', sle: '<=', sgt: '>', sge: '>=', ult: '<', ule: '<=', ugt: '>', uge: '>=' }[pred];
      if (!o) throw new Error('unsupported icmp ' + pred);
      if (t.k === 'ptr') return '(' + a + o + b + '?1:0)';
      if (u && bits === 64) return '(UCMP(' + a + ',' + b + ')' + o + '0?1:0)';
      if (u) { a = UNS(bits, a); b = UNS(bits, b); }
      return '(' + a + o + b + '?1:0)';
    }
    function fcmp(pred, a, b) {
      var base = pred.slice(1);
      var o = { eq: '===', ne: '!==', lt: '<', le: '<=', gt: '>', ge: '>=' }[base];
      if (pred === 'ord') return '((' + a + '===' + a + '&&' + b + '===' + b + ')?1:0)';
      if (pred === 'uno') return '((' + a + '!==' + a + '||' + b + '!==' + b + ')?1:0)';
      if (pred === 'true') return '1';
      if (pred === 'false') return '0';
      if (!o) throw new Error('unsupported fcmp ' + pred);
      if (pred[0] === 'o') return '(' + a + o + b + '?1:0)';
      return '((' + a + '!==' + a + '||' + b + '!==' + b + '||' + a + o + b + ')?1:0)'; // unordered or ...
    }
    function cast(op, ft, v, tt) {
      var fb = ft.bits, tb = tt.bits;
      switch (op) {
        case 'trunc': return tb === 64 ? v : fb === 64 ? 'T64(' + v + ',' + tb + ')' : WRAP(tb, v);
        case 'zext': return UNS(fb, v);
        case 'sext': return v;
        case 'fptosi': return tb === 64 ? 'F2I64(' + v + ')' : WRAP(tb, 'Math.trunc(' + v + ')');
        case 'fptoui': return tb === 64 ? 'F2I64(' + v + ')' : WRAP(tb, 'Math.trunc(' + v + ')');
        case 'sitofp': { var x = fb === 64 ? 'Number(' + v + ')' : v; return tt.k === 'float' ? 'Math.fround(' + x + ')' : x; }
        case 'uitofp': { var y = fb === 64 ? 'U2F64(' + v + ')' : UNS(fb, v); return tt.k === 'float' ? 'Math.fround(' + y + ')' : y; }
        case 'fpext': return v;
        case 'fptrunc': return 'Math.fround(' + v + ')';
        case 'ptrtoint': return tb === 64 ? v : WRAP(tb, v);
        case 'inttoptr': return fb === 64 ? 'P64(' + v + ')' : '(' + v + '>>>0)';
        case 'bitcast':
          if (ft.k === 'ptr' && tt.k === 'ptr') return v;
          if (ft.k === 'double' && tt.k === 'int') return 'F64I64(' + v + ')';
          if (ft.k === 'int' && tt.k === 'double') return 'I64F64(' + v + ')';
          if (ft.k === 'float' && tt.k === 'int') return 'F32I32(' + v + ')';
          if (ft.k === 'int' && tt.k === 'float') return 'I32F32(' + v + ')';
          return v;
      }
      throw new Error('unsupported cast ' + op);
    }

    // overflow intrinsics, as { result, flag }
    function overflow(op, bits, a, b) {
      var sg = op[0] === 's', kind = op.slice(1, 4);
      if (bits === 64 && sg) return { add: 'OA64', sub: 'OS64', mul: 'OM64' }[kind] + '(' + a + ',' + b + ')';
      if (bits === 64 || !sg) return 'OVF(' + JSON.stringify(op[0] + kind) + ',' + bits + ',' + a + ',' + b + ')';
      var f = kind === 'add' ? '+' : kind === 'sub' ? '-' : '*';
      return 'OVS' + bits + '(' + a + ',' + b + ',' + JSON.stringify(f) + ')';
    }

    function genFunc(f) {
      var locals = {}, blocks = [], bmap = {}, cur = null;
      f.lines.forEach(function (l) {
        var m = /^([\w.$-]+|"[^"]*"):$/.exec(l);
        if (m) { cur = { label: m[1].replace(/^"|"$/g, ''), ins: [] }; bmap[cur.label] = blocks.length; blocks.push(cur); }
        else { if (!cur) { cur = { label: 'entry', ins: [] }; bmap.entry = 0; blocks.push(cur); } cur.ins.push(l); }
      });
      // a scalar alloca that is only loaded from and stored to lives in a JS variable, not in memory
      var promoted = {};
      (function () {
        var al = {}, total = {}, ok = {}, any = false;
        f.lines.forEach(function (l) {
          var m = new RegExp('^(' + NAME + ') = alloca (i\\d+|float|double|ptr)(?:, align \\d+)?$').exec(l);
          if (m) { al[m[1]] = m[2]; total[m[1]] = 0; ok[m[1]] = 0; any = true; }
        });
        if (!any) return;
        f.lines.forEach(function (l) {
          var toks = l.match(/%(?:"[^"]*"|[\w.$-]+)/g) || [];
          var m = /^(?:%\S+ = load (\S+)|store (\S+) \S+), ptr (%(?:"[^"]*"|[\w.$-]+))(?:, align \d+)?$/.exec(l);
          var own = new RegExp('^(' + NAME + ') = alloca ').exec(l);
          toks.forEach(function (tk, i) {
            if (al[tk] === undefined || (own && own[1] === tk && i === 0)) return;
            total[tk]++;
          });
          if (m && al[m[3]] !== undefined && (m[1] || m[2]) === al[m[3]]) ok[m[3]]++;
        });
        Object.keys(al).forEach(function (k) { if (ok[k] === total[k]) promoted[mangle(k)] = tyOf(al[k]); });
      })();
      var phis = blocks.map(function () { return []; });
      var out = [];
      var bi;
      function jump(from, label) {
        var to = bmap[label.replace(/^%/, '').replace(/^"|"$/g, '')];
        if (to === undefined) throw new Error('unknown label ' + label);
        var ps = phis[to], s = '';
        if (ps.length) {
          var tmp = [];
          ps.forEach(function (p, i) {
            var inc = p.inc[blocks[from].label];
            if (inc === undefined) throw new Error('phi without edge from ' + blocks[from].label);
            tmp.push('const q' + i + '=' + inc + ';');
          });
          s = '{' + tmp.join('') + ps.map(function (p, i) { return p.dest + '=q' + i + ';'; }).join('') + '}';
        }
        return s + 'bb=' + to + ';continue;';
      }
      // phis first (so edges can be found)
      blocks.forEach(function (b, k) {
        b.ins.forEach(function (l) {
          var m = new RegExp('^(' + NAME + ') = phi (.*)$').exec(l);
          if (!m) return;
          var r = parseType(m[2], 0), t = r[0], rest = m[2].slice(r[1]);
          var inc = {};
          splitTop(rest).forEach(function (grp) {
            grp = grp.trim().replace(/^\[/, '').replace(/\]$/, '');
            var pp = splitTop(grp);
            inc[pp[1].trim().replace(/^%/, '').replace(/^"|"$/g, '')] = val(pp[0], t);
          });
          locals[mangle(m[1])] = 1;
          phis[k].push({ dest: mangle(m[1]), inc: inc });
        });
      });
      blocks.forEach(function (b, k) {
        bi = k;
        out.push('case ' + k + ':');
        b.ins.forEach(function (l) {
          var m, dest = null, rest = l;
          if ((m = new RegExp('^(' + NAME + ') = (.*)$').exec(l))) { dest = mangle(m[1]); rest = m[2]; locals[dest] = 1; }
          var sp = rest.indexOf(' '), op = sp < 0 ? rest : rest.slice(0, sp), args = sp < 0 ? '' : rest.slice(sp + 1);
          if (op === 'tail' || op === 'musttail' || op === 'notail') { rest = args; sp = rest.indexOf(' '); op = rest.slice(0, sp); args = rest.slice(sp + 1); }
          var r, t, a, parts;
          switch (op) {
            case 'phi': return;
            case 'alloca': {
              parts = splitTop(args); t = tyOf(parts[0]);
              if (promoted[dest]) { out.push(dest + '=' + dflt(t) + ';'); return; }
              var cnt = '1';
              if (parts[1] && /^i\d+ /.test(parts[1])) cnt = String(Number(parts[1].split(' ')[1]));
              out.push('SP=(SP-' + sizeOf(t) + '*' + cnt + ')&~' + (alignOf(t) - 1) + ';' + dest + '=SP;');
              return;
            }
            case 'load': {
              parts = splitTop(args); t = tyOf(parts[0]);
              var pr = parseType(parts[1], 0);
              if (promoted[mangle(parts[1].slice(pr[1]).trim())]) { out.push(dest + '=' + mangle(parts[1].slice(pr[1]).trim()) + ';'); return; }
              out.push(dest + '=' + ld(t, val(parts[1].slice(pr[1]), pr[0])) + ';');
              return;
            }
            case 'store': {
              parts = splitTop(args);
              r = parseType(parts[0], 0); var vv = val(parts[0].slice(r[1]), r[0]);
              var pr2 = parseType(parts[1], 0);
              if (promoted[mangle(parts[1].slice(pr2[1]).trim())]) { out.push(mangle(parts[1].slice(pr2[1]).trim()) + '=' + vv + ';'); return; }
              out.push(st(r[0], val(parts[1].slice(pr2[1]), pr2[0]), vv) + ';');
              return;
            }
            case 'getelementptr': {
              parts = splitTop(args);
              if (parts[0].indexOf('inbounds ') === 0) parts[0] = parts[0].slice(9);
              t = tyOf(parts[0]);
              var pp = parseType(parts[1], 0);
              var addr = val(parts[1].slice(pp[1]), pp[0]);
              var expr = addr, cty = t;
              for (var k2 = 2; k2 < parts.length; k2++) {
                var ir = parseType(parts[k2], 0), it = ir[0], iv = parts[k2].slice(ir[1]).trim();
                var isConst = /^-?\d+$/.test(iv);
                var ixn = isConst ? Number(iv) : null, ixe = isConst ? null : (it.bits === 64 ? 'Number(' + val(iv, it) + ')' : val(iv, it));
                if (k2 === 2) {
                  expr += '+' + (isConst ? ixn * sizeOf(t) : '(' + ixe + ')*' + sizeOf(t));
                } else if (cty.k === 'struct') {
                  if (!isConst) throw new Error('non-constant struct index');
                  expr += '+' + fieldOff(cty, ixn); cty = cty.elems[ixn];
                } else if (cty.k === 'array') {
                  expr += '+' + (isConst ? ixn * sizeOf(cty.elem) : '(' + ixe + ')*' + sizeOf(cty.elem)); cty = cty.elem;
                } else throw new Error('bad gep');
              }
              out.push(dest + '=(' + expr + ')>>>0;');
              return;
            }
            case 'icmp': case 'fcmp': {
              var sp2 = args.indexOf(' '), pred = args.slice(0, sp2);
              parts = splitTop(args.slice(sp2 + 1));
              r = parseType(parts[0], 0); t = r[0];
              a = val(parts[0].slice(r[1]), t); var b2 = val(parts[1], t);
              out.push(dest + '=' + (op === 'icmp' ? icmp(pred, t, a, b2) : fcmp(pred, a, b2)) + ';');
              return;
            }
            case 'trunc': case 'zext': case 'sext': case 'fptosi': case 'fptoui': case 'sitofp': case 'uitofp':
            case 'fpext': case 'fptrunc': case 'ptrtoint': case 'inttoptr': case 'bitcast': {
              m = /^(.*?) to (.*)$/.exec(args);
              r = parseType(m[1], 0);
              out.push(dest + '=' + cast(op, r[0], val(m[1].slice(r[1]), r[0]), tyOf(m[2])) + ';');
              return;
            }
            case 'select': {
              parts = splitTop(args);
              var cr = parseType(parts[0], 0), c = val(parts[0].slice(cr[1]), cr[0]);
              var t1 = parseType(parts[1], 0), t2 = parseType(parts[2], 0);
              out.push(dest + '=(' + c + '?' + val(parts[1].slice(t1[1]), t1[0]) + ':' + val(parts[2].slice(t2[1]), t2[0]) + ');');
              return;
            }
            case 'fneg': {
              r = parseType(args, 0);
              out.push(dest + '=-' + val(args.slice(r[1]), r[0]) + ';');
              return;
            }
            case 'extractvalue': {
              parts = splitTop(args); r = parseType(parts[0], 0);
              var e = val(parts[0].slice(r[1]), r[0]);
              for (var q = 1; q < parts.length; q++) e += '[' + parts[q] + ']';
              out.push(dest + '=' + e + ';');
              return;
            }
            case 'insertvalue': {
              parts = splitTop(args); r = parseType(parts[0], 0);
              var agg = val(parts[0].slice(r[1]), r[0]);
              var er = parseType(parts[1], 0), ev = val(parts[1].slice(er[1]), er[0]);
              out.push(dest + '=INS(' + agg + ',[' + parts.slice(2).join(',') + '],' + ev + ');');
              return;
            }
            case 'call': {
              var cs = args.replace(/^(?:(?:fastcc|ccc|noundef|nonnull|signext|zeroext)\s+)+/, '');
              r = parseType(cs, 0);
              var rt = r[0], crest = cs.slice(r[1]).trim();
              if (crest[0] === '(') { var dd = 0, ci = 0; for (; ci < crest.length; ci++) { if (crest[ci] === '(') dd++; else if (crest[ci] === ')' && --dd === 0) break; } crest = crest.slice(ci + 1).trim(); }
              m = new RegExp('^(' + NAME + ')\\((.*)\\)[^)]*$').exec(crest);
              if (!m) throw new Error('unsupported call: ' + l);
              var callee = m[1], argStr = m[2];
              var argv = splitTop(argStr).filter(function (x) { return x !== ''; }).map(function (x) {
                var rr = parseType(x, 0); var rest2 = x.slice(rr[1]).trim().replace(/^(?:noundef|nonnull|signext|zeroext)\s+/, '');
                return { t: rr[0], v: val(rest2, rr[0]) };
              });
              var call;
              if (callee[0] === '%') {
                call = 'CALLI(' + mangle(callee) + ',[' + argv.map(function (x) { return x.v; }).join(',') + '],' + tid(rt) + ')';
              } else {
                var cn = unq(callee);
                if (cn.indexOf('llvm.') === 0) call = intrinsic(cn, argv, rt);
                else if (fid[cn] !== undefined) call = mangle('@' + cn).replace(/^v_/, 'f_') + '(' + argv.map(function (x) { return x.v; }).join(',') + ')';
                else call = extRef(cn, rt) + '(' + argv.map(function (x) { return x.v; }).join(',') + ')';
              }
              out.push((dest && rt.k !== 'void' ? dest + '=' : '') + call + ';');
              return;
            }
            case 'br': {
              parts = splitTop(args);
              if (parts.length === 1) { out.push(jump(bi, parts[0].replace(/^label /, ''))); return; }
              var cr2 = parseType(parts[0], 0);
              out.push('if(' + val(parts[0].slice(cr2[1]), cr2[0]) + '){' + jump(bi, parts[1].replace(/^label /, '')) + '}else{' + jump(bi, parts[2].replace(/^label /, '')) + '}');
              return;
            }
            case 'switch': {
              m = /^(.*?),\s*label\s+(%\S+)\s*\[(.*)\]\s*$/.exec(args);
              r = parseType(m[1], 0); var sv = val(m[1].slice(r[1]), r[0]);
              var s2 = 'switch(' + sv + '){';
              var cre = /(i\d+)\s+(-?\d+),\s*label\s+(%[^\s\]]+)/g, cm;
              while ((cm = cre.exec(m[3]))) s2 += 'case ' + (r[0].bits === 64 ? lit64(cm[2]) : cm[2]) + ':{' + jump(bi, cm[3]) + '}';
              s2 += 'default:{' + jump(bi, m[2]) + '}}';
              out.push(s2);
              return;
            }
            case 'ret': {
              if (args === 'void') { out.push('SP=sp0;return;'); return; }
              r = parseType(args, 0);
              out.push('{const rv=' + val(args.slice(r[1]), r[0]) + ';SP=sp0;return rv;}');
              return;
            }
            case 'unreachable': out.push('throw new Error("unreachable");'); return;
            default:
              if (/^(add|sub|mul|sdiv|udiv|srem|urem|and|or|xor|shl|lshr|ashr|fadd|fsub|fmul|fdiv|frem)$/.test(op)) {
                var sp3 = args.search(/ (?=[^ ]*$)/); // skip nsw/nuw/exact
                var args2 = args.replace(/^(?:nsw |nuw |exact |fast |nnan |ninf )+/, '');
                var pr3 = parseType(args2, 0); parts = splitTop(args2.slice(pr3[1]));
                out.push(dest + '=' + binop(op, pr3[0], val(parts[0], pr3[0]), val(parts[1], pr3[0])) + ';');
                return;
              }
              throw new Error('unsupported instruction: ' + l);
          }
        });
      });
      var sig = f.params.map(function (p) { return mangle(p.name); }).join(',');
      var decl = Object.keys(locals).filter(function (n) { return f.params.every(function (p) { return mangle(p.name) !== n; }); });
      return 'function ' + mangle('@' + f.name).replace(/^v_/, 'f_') + '(' + sig + '){const sp0=SP;' + (decl.length ? 'let ' + decl.join(',') + ';' : '') +
        'let bb=0;for(;;){switch(bb){' + out.join('\n') + '\ndefault:throw new Error("bad block");}}}';
    }

    function intrinsic(name, argv, rt) {
      var m;
      if ((m = /^llvm\.(s|u)(add|sub|mul)\.with\.overflow\.i(\d+)$/.exec(name))) return overflow(m[1] + m[2], +m[3], argv[0].v, argv[1].v);
      if (/^llvm\.fabs\./.test(name)) return 'Math.abs(' + argv[0].v + ')';
      if (/^llvm\.sqrt\./.test(name)) return 'Math.sqrt(' + argv[0].v + ')';
      if (/^llvm\.(memmove|memcpy)\./.test(name)) return 'MOVE(' + argv[0].v + ',' + argv[1].v + ',' + argv[2].v + ')';
      if (/^llvm\.memset\./.test(name)) return 'SET(' + argv[0].v + ',' + argv[1].v + ',' + argv[2].v + ')';
      if (/^llvm\.(lifetime|assume|dbg)/.test(name)) return '0';
      throw new Error('unsupported intrinsic ' + name);
    }

    // allocate the globals in memory first, so the code can use their addresses
    mod.order.forEach(function () { });
    var code = [];
    mod.order.forEach(function (n) { code.push(genFunc(mod.funcs[n])); });
    return { code: (extList.length ? 'var ' + extList.join(',') + ';\n' : '') + code.join('\n'), types: types, fid: fid, ids: ids };
  }

  // ---- running ----
  // rt: the instance of runtime.wasm ({ exports }); returns { main(argc, argv) -> code }
  function load(text, rt, opts) {
    opts = opts || {};
    var ex = rt.exports, M = ex.memory, B = null, D = null, U8 = null;
    function R() { B = M.buffer; D = new DataView(B); U8 = new Uint8Array(B); }
    R();
    // the runtime never frees memory (no collector), so give it room at once: growing one step at a time
    // is slow, and every growth makes the engine drop its views of the memory
    try {
      var want = (opts.heapBytes || (192 << 20)) - M.buffer.byteLength;
      if (want > 0) { M.grow(Math.ceil(want / 65536)); R(); }
    } catch (e) { /* a small device: grow on demand */ }
    var mod = parseModule(text);
    // globals: all addresses first (initializers may point at each other and at functions)
    var gnames = Object.keys(mod.globals);
    gnames.forEach(function (n) {
      var g = mod.globals[n];
      var size = g.bytes ? g.bytes.length : sizeOf(g.type);
      g.addr = ex.malloc(size || 1) >>> 0; R();
      for (var i = 0; i < size; i++) U8[g.addr + i] = 0;
    });
    var fidPre = {};
    mod.order.forEach(function (n, i) { fidPre[n] = 0x100000 + i * 4; });
    var externs = [], externIndex = {};
    var env = { externId: function (n) { if (externIndex[n] === undefined) { externIndex[n] = externs.length; externs.push(n); } return 0x200000 + externIndex[n] * 4; } };
    function evalConst(t, tok) {
      tok = tok.trim();
      if (tok[0] === '@') {
        var nm = tok.slice(1); if (nm[0] === '"') nm = nm.slice(1, -1);
        if (mod.globals[nm]) return mod.globals[nm].addr;
        if (fidPre[nm] !== undefined) return fidPre[nm];
        return env.externId(nm);
      }
      if (tok === 'null' || tok === 'zeroinitializer' || tok === 'undef') return (t.k === 'struct' || t.k === 'array') ? null : 0;
      if (t.k === 'struct' || t.k === 'array') {
        var inner = tok.replace(/^[\{\[]/, '').replace(/[\}\]]$/, '');
        return splitTop(inner).map(function (p, i) { var r = parseType(p, 0); return evalConst(r[0], p.slice(r[1])); });
      }
      if (t.k === 'int') return t.bits === 64 ? NORM(BigInt(tok)) : Number(tok);
      return Number(tok);
    }
    gnames.forEach(function (n) {
      var g = mod.globals[n];
      if (g.bytes) { for (var i = 0; i < g.bytes.length; i++) U8[g.addr + i] = g.bytes[i]; }
      else if (g.init && g.init !== 'zeroinitializer') {
        var v = evalConst(g.type, g.init);
        if (v !== null) STT(g.type, g.addr, v);
      }
    });
    // stack for alloca
    var STACK = opts.stackBytes || (4 << 20);
    var stackBase = ex.malloc(STACK) >>> 0; R();
    var SP = stackBase + STACK;
    var gen = genModule(mod, env);
    var T = gen.types;

    function LD64(a) {
      var lo = D.getUint32(a, true), hi = D.getInt32(a + 4, true);
      if (hi >= -2097152 && hi < 2097152) { var n = hi * 4294967296 + lo; if (n >= -MAXS) return n; }
      return asI(64, (BigInt(hi) << 32n) | BigInt(lo));
    }
    function ST64(a, v) {
      if (typeof v === 'number') { var hi = Math.floor(v / 4294967296); D.setUint32(a, v - hi * 4294967296, true); D.setInt32(a + 4, hi, true); }
      else D.setBigInt64(a, v, true);
    }
    function LD(t, a) {
      var ty = T[t];
      if (ty.k === 'struct') { sizeOf(ty); return ty.elems.map(function (e, i) { return LDT(e, a + ty.offs[i]); }); }
      var r = [], es = sizeOf(ty.elem);
      for (var i = 0; i < ty.n; i++) r.push(LDT(ty.elem, a + i * es));
      return r;
    }
    function LDT(ty, a) {
      switch (ty.k) {
        case 'int': return ty.bits === 1 ? D.getUint8(a) & 1 : ty.bits === 8 ? D.getInt8(a) : ty.bits === 16 ? D.getInt16(a, true) : ty.bits === 32 ? D.getInt32(a, true) : LD64(a);
        case 'float': return D.getFloat32(a, true);
        case 'double': return D.getFloat64(a, true);
        case 'ptr': return D.getUint32(a, true);
        default: { var i = T.indexOf(ty); if (i < 0) { T.push(ty); i = T.length - 1; } return LD(i, a); }
      }
    }
    function ST(t, a, v) { STT(T[t], a, v); }
    function STT(ty, a, v) {
      switch (ty.k) {
        case 'int': if (ty.bits <= 8) D.setInt8(a, v); else if (ty.bits === 16) D.setInt16(a, v, true); else if (ty.bits === 32) D.setInt32(a, v, true); else ST64(a, v); return;
        case 'float': D.setFloat32(a, v, true); return;
        case 'double': D.setFloat64(a, v, true); return;
        case 'ptr': D.setUint32(a, v, true); return;
        case 'struct': sizeOf(ty); ty.elems.forEach(function (e, i) { STT(e, a + ty.offs[i], v[i]); }); return;
        case 'array': { var es = sizeOf(ty.elem); for (var i = 0; i < ty.n; i++) STT(ty.elem, a + i * es, v[i]); return; }
      }
    }
    function INS(agg, path, e) {
      var c = agg.slice(); var cur = c;
      for (var i = 0; i < path.length - 1; i++) { cur[path[i]] = cur[path[i]].slice(); cur = cur[path[i]]; }
      cur[path[path.length - 1]] = e; return c;
    }
    function OVF(op, bits, a, b) { // op: 'sadd' ... 'umul'
      var sg = op[0] === 's', k = op.slice(1);
      var A = BigInt(a), Bv = BigInt(b);
      if (!sg) { A = BigInt.asUintN(bits, A); Bv = BigInt.asUintN(bits, Bv); }
      var r = k === 'add' ? A + Bv : k === 'sub' ? A - Bv : A * Bv;
      var w = sg ? BigInt.asIntN(bits, r) : BigInt.asUintN(bits, r), ov = w !== r ? 1 : 0;
      var res = bits === 64 ? NORM(BigInt.asIntN(64, w)) : Number(BigInt.asIntN(bits, w));
      return [res, ov];
    }
    function OVS32(a, b, f) { var r = f === '+' ? a + b : f === '-' ? a - b : a * b; var w = f === '*' ? Math.imul(a, b) : (r | 0); return [w, w !== r ? 1 : 0]; }
    function OVS16(a, b, f) { var r = f === '+' ? a + b : f === '-' ? a - b : a * b; var w = (r << 16) >> 16; return [w, w !== r ? 1 : 0]; }
    function OVS8(a, b, f) { var r = f === '+' ? a + b : f === '-' ? a - b : a * b; var w = (r << 24) >> 24; return [w, w !== r ? 1 : 0]; }
    function MOVE(d, s, n) { n = Number(n); U8.copyWithin(d, s, s + n); }
    function SET(d, v, n) { U8.fill(v & 255, d, d + Number(n)); }
    var fb = new DataView(new ArrayBuffer(8));
    function F64I64(x) { fb.setFloat64(0, x, true); return NORM(fb.getBigInt64(0, true)); }
    function I64F64(x) { fb.setBigInt64(0, BIG(x), true); return fb.getFloat64(0, true); }
    function F32I32(x) { fb.setFloat32(0, x, true); return fb.getInt32(0, true); }
    function I32F32(x) { fb.setInt32(0, x, true); return fb.getFloat32(0, true); }
    function HEXD(h) { fb.setBigUint64(0, BigInt('0x' + h), true); return fb.getFloat64(0, true); }

    var MATH = {
      sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
      exp: Math.exp, log: Math.log, log10: Math.log10, log2: Math.log2, pow: Math.pow, floor: Math.floor, ceil: Math.ceil, round: Math.round,
      trunc: Math.trunc, fabs: Math.abs, fmod: function (a, b) { return a % b; }, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, cbrt: Math.cbrt,
      hypot: Math.hypot
    };
    // there are no threads here: a spawned function runs to completion at once
    var HOST = {
      zevic_thread_start: function (c) { byId[c[0]](c[1]); },
      zevic_thread_spawn: function (c) { byId[c[0]](c[1]); return 1; },
      zevic_thread_join: function () { },
      zevic_thread_detach: function () { },
      zevic_thread_yield: function () { },
      zevic_mutex_new: function () { return 1; },
      zevic_mutex_lock: function () { },
      zevic_mutex_unlock: function () { },
      zevic_cond_new: function () { return 1; },
      zevic_cond_wait: function () { throw new Error('deadlock: a task waits for something that no other task can do here (there are no threads in the playground)'); },
      zevic_cond_broadcast: function () { },
      zevic_sleep_ns: function () { }
    };
    var exCache = {};
    function EX(name, rtId) {
      var f = exCache[name];
      if (f) return f;
      var rty = T[rtId], decl = mod.decls[name], big = [];
      (decl ? decl.params : []).forEach(function (p, i) { if (p.k === 'int' && p.bits === 64) big.push(i); });
      var isPtr = rty.k === 'ptr', isI64 = rty.k === 'int' && rty.bits === 64, fn = null;
      f = function () {
        if (!fn) {
          fn = HOST[name] || MATH[name] || ex[name];
          if (!fn) throw new Error('the runtime has no function ' + name);
        }
        for (var i = 0; i < big.length; i++) { var k = big[i]; if (k < arguments.length && typeof arguments[k] === 'number') arguments[k] = BigInt(arguments[k]); }
        var r = fn.apply(null, arguments);
        if (M.buffer !== B) R();
        return isPtr ? r >>> 0 : isI64 ? NORM(r) : r;
      };
      exCache[name] = f;
      return f;
    }
    var byId = {};
    function CALLI(p, args) {
      var fnr = byId[p];
      if (!fnr) throw new Error('call through a bad function pointer ' + p);
      return fnr.apply(null, args);
    }

    var src = 'var SP=0;\n' + gen.code + '\nreturn {' + mod.order.map(function (n) { return JSON.stringify(n) + ':' + mangle('@' + n).replace(/^v_/, 'f_'); }).join(',') +
      ',__setSP:function(v){SP=v;},__setD:function(v){D=v;}};';
    if (opts.dump) opts.dump(src);
    var factory = new Function('H', 'LD', 'ST', 'INS', 'OVF', 'OVS32', 'OVS16', 'OVS8', 'MOVE', 'SET', 'F64I64', 'I64F64', 'F32I32', 'I32F32', 'HEXD', 'EX', 'CALLI', 'getD',
      'var D=getD();var {A64,S64,M64,D64,R64,UD64,UR64,AND64,OR64,XOR64,SHL64,LSHR64,ASHR64,UCMP,T64,F2I64,U2F64,P64,OA64,OS64,OM64,LD64,ST64}=H;' + src);
    var H = Object.assign({ LD64: LD64, ST64: ST64 }, H64);
    var fns = factory(H, LD, ST, INS, OVF, OVS32, OVS16, OVS8, MOVE, SET, F64I64, I64F64, F32I32, I32F32, HEXD, EX, CALLI, function () { return D; });
    var origR = R;
    R = function () { origR(); fns.__setD(D); };
    fns.__setSP(SP);
    mod.order.forEach(function (n) { byId[gen.fid[n]] = fns[n]; });
    return {
      call: function (name, args) { return fns[name].apply(null, args || []); },
      has: function (name) { return !!fns[name]; },
      funcs: fns
    };
  }

  var api = { parseModule: parseModule, genModule: genModule, load: load, parseType: parseType };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZIR = api;
})(typeof window !== 'undefined' ? window : globalThis);
