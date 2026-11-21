// A small WASI (preview1) host for runtime.wasm and zevic.wasm, for the browser and node.
// makeWasi({ stdout(bytes), stderr(bytes), args: [..], env: {..} }) -> { imports, bind(instance) }
(function (root) {
  'use strict';
  function makeWasi(opts) {
    opts = opts || {};
    var inst = null;
    var enc = new TextEncoder();
    var args = (opts.args || []).map(function (a) { return enc.encode(a + '\0'); });
    var envs = Object.keys(opts.env || {}).map(function (k) { return enc.encode(k + '=' + opts.env[k] + '\0'); });
    function mem() { return new DataView(inst.exports.memory.buffer); }
    function u8() { return new Uint8Array(inst.exports.memory.buffer); }
    var ENOSYS = 52, EBADF = 8, ESPIPE = 70, ENOENT = 44, EISDIR = 31, ENOTDIR = 54;
    // an in-memory file system: opts.files maps absolute paths to bytes (or strings); opts.preopens lists the roots
    var files = {}, dirs = {};
    Object.keys(opts.files || {}).forEach(function (k) { var v = opts.files[k]; files[k] = typeof v === 'string' ? enc.encode(v) : v; });
    var preopens = opts.preopens || [];
    preopens.forEach(function (p) { dirs[p] = true; });
    var fds = {}; var nextFd = 3 + preopens.length;
    preopens.forEach(function (p, i) { fds[3 + i] = { dir: true, path: p, pre: true }; });
    function norm(p) {
      var out = [];
      p.split('/').forEach(function (x) { if (x === '' || x === '.') return; if (x === '..') out.pop(); else out.push(x); });
      return '/' + out.join('/');
    }
    function isDir(p) {
      if (dirs[p]) return true;
      var pre = p === '/' ? '/' : p + '/';
      return Object.keys(files).some(function (k) { return k.indexOf(pre) === 0; });
    }
    function readStr(ptr, len) { return new TextDecoder().decode(u8().subarray(ptr, ptr + len)); }
    function filestat(buf, type, size) {
      var d = mem(); for (var i = 0; i < 64; i += 8) d.setBigUint64(buf + i, 0n, true);
      d.setUint8(buf + 16, type); d.setBigUint64(buf + 24, 1n, true); d.setBigUint64(buf + 32, BigInt(size), true);
    }
    function ExitError(code) { this.code = code; this.message = 'exit ' + code; }
    ExitError.prototype = Object.create(Error.prototype);
    var table = {
      args_sizes_get: function (cp, sp) { var d = mem(); d.setUint32(cp, args.length, true); d.setUint32(sp, args.reduce(function (n, a) { return n + a.length; }, 0), true); return 0; },
      args_get: function (ap, bp) { var d = mem(), u = u8(); args.forEach(function (a, i) { d.setUint32(ap + 4 * i, bp, true); u.set(a, bp); bp += a.length; }); return 0; },
      environ_sizes_get: function (cp, sp) { var d = mem(); d.setUint32(cp, envs.length, true); d.setUint32(sp, envs.reduce(function (n, a) { return n + a.length; }, 0), true); return 0; },
      environ_get: function (ap, bp) { var d = mem(), u = u8(); envs.forEach(function (a, i) { d.setUint32(ap + 4 * i, bp, true); u.set(a, bp); bp += a.length; }); return 0; },
      clock_time_get: function (id, prec, out) {
        var ns = id === 0 ? BigInt(Date.now()) * 1000000n : BigInt(Math.round(performance.now() * 1e6));
        mem().setBigUint64(out, ns, true); return 0;
      },
      clock_res_get: function (id, out) { mem().setBigUint64(out, 1000000n, true); return 0; },
      fd_write: function (fd, iovs, n, nw) {
        var d = mem(), u = u8(), total = 0, parts = [];
        if (fds[fd] && !fds[fd].dir) {
          var f = fds[fd], data = f.data;
          for (var j = 0; j < n; j++) {
            var pp = d.getUint32(iovs + 8 * j, true), ll = d.getUint32(iovs + 8 * j + 4, true);
            if (f.pos + ll > data.length) { var nd = new Uint8Array(Math.max(data.length * 2, f.pos + ll)); nd.set(data.subarray(0, f.size)); data = f.data = nd; }
            data.set(u.subarray(pp, pp + ll), f.pos); f.pos += ll; if (f.pos > f.size) f.size = f.pos; total += ll;
          }
          files[f.path] = data.subarray(0, f.size); f.data = data;
          d.setUint32(nw, total, true); return 0;
        }
        for (var i = 0; i < n; i++) {
          var p = d.getUint32(iovs + 8 * i, true), l = d.getUint32(iovs + 8 * i + 4, true);
          parts.push(u.slice(p, p + l)); total += l;
        }
        if (fd !== 1 && fd !== 2) return EBADF;
        var all = new Uint8Array(total), o = 0;
        parts.forEach(function (x) { all.set(x, o); o += x.length; });
        (fd === 1 ? opts.stdout : opts.stderr)(all);
        d.setUint32(nw, total, true); return 0;
      },
      fd_read: function (fd, iovs, n, nr) {
        var d = mem(), u = u8();
        if (fds[fd] && !fds[fd].dir) {
          var f = fds[fd], total = 0;
          for (var j = 0; j < n; j++) {
            var pp = d.getUint32(iovs + 8 * j, true), ll = d.getUint32(iovs + 8 * j + 4, true);
            var k = Math.min(ll, f.size - f.pos); if (k <= 0) break;
            u.set(f.data.subarray(f.pos, f.pos + k), pp); f.pos += k; total += k;
            if (k < ll) break;
          }
          d.setUint32(nr, total, true); return 0;
        }
        if (fds[fd]) return EISDIR;
        if (fd !== 0) return EBADF; d.setUint32(nr, 0, true); return 0;
      },
      fd_close: function (fd) { if (fds[fd] && !fds[fd].pre) delete fds[fd]; return 0; },
      fd_seek: function (fd, off, whence, out) {
        var f = fds[fd]; if (!f || f.dir) return ESPIPE;
        var o = Number(off), np = whence === 0 ? o : whence === 1 ? f.pos + o : f.size + o;
        if (np < 0) return 28; f.pos = np; mem().setBigUint64(out, BigInt(np), true); return 0;
      },
      fd_tell: function (fd, out) { var f = fds[fd]; if (!f) return EBADF; mem().setBigUint64(out, BigInt(f.pos), true); return 0; },
      fd_prestat_get: function (fd, buf) {
        var f = fds[fd]; if (!f || !f.pre) return EBADF;
        var d = mem(); d.setUint8(buf, 0); d.setUint32(buf + 4, enc.encode(f.path).length, true); return 0;
      },
      fd_prestat_dir_name: function (fd, p, len) { var f = fds[fd]; if (!f || !f.pre) return EBADF; u8().set(enc.encode(f.path).subarray(0, len), p); return 0; },
      path_open: function (dirfd, dflags, pp, pl, oflags, rb, ri, ff, out) {
        var dir = fds[dirfd]; if (!dir || !dir.dir) return EBADF;
        var path = norm(dir.path + '/' + readStr(pp, pl));
        var wantDir = (oflags & 2) !== 0;
        if (isDir(path)) { fds[nextFd] = { dir: true, path: path }; mem().setUint32(out, nextFd++, true); return 0; }
        if (wantDir) return ENOENT;
        var data = files[path];
        if (data === undefined) {
          if (!(oflags & 1)) return ENOENT;
          data = new Uint8Array(0); files[path] = data;
        } else if (oflags & 4) return 20;
        if (oflags & 8) { data = new Uint8Array(0); files[path] = data; }
        var fd = { path: path, data: data, size: data.length, pos: 0 };
        fds[nextFd] = fd; mem().setUint32(out, nextFd++, true); return 0;
      },
      path_filestat_get: function (dirfd, fl, pp, pl, buf) {
        var dir = fds[dirfd]; if (!dir || !dir.dir) return EBADF;
        var path = norm(dir.path + '/' + readStr(pp, pl));
        if (isDir(path)) { filestat(buf, 3, 0); return 0; }
        if (files[path] === undefined) return ENOENT;
        filestat(buf, 4, files[path].length); return 0;
      },
      fd_filestat_get: function (fd, buf) {
        var f = fds[fd]; if (!f) return fd <= 2 ? (filestat(buf, 2, 0), 0) : EBADF;
        if (f.dir) filestat(buf, 3, 0); else filestat(buf, 4, f.size); return 0;
      },
      path_create_directory: function (dirfd, pp, pl) { var dir = fds[dirfd]; if (!dir) return EBADF; dirs[norm(dir.path + '/' + readStr(pp, pl))] = true; return 0; },
      path_unlink_file: function (dirfd, pp, pl) { var dir = fds[dirfd]; if (!dir) return EBADF; var p = norm(dir.path + '/' + readStr(pp, pl)); if (files[p] === undefined) return ENOENT; delete files[p]; return 0; },
      fd_readdir: function (fd, buf, blen, cookie, used) {
        var f = fds[fd]; if (!f || !f.dir) return EBADF;
        var pre = f.path === '/' ? '/' : f.path + '/', seen = {}, names = [];
        Object.keys(files).concat(Object.keys(dirs)).forEach(function (k) {
          if (k.indexOf(pre) !== 0 || k === f.path) return;
          var rest = k.slice(pre.length), nm = rest.split('/')[0];
          if (nm && !seen[nm]) { seen[nm] = 1; names.push({ n: nm, d: rest.indexOf('/') >= 0 || !!dirs[k] }); }
        });
        var d = mem(), u = u8(), off = 0;
        for (var i = Number(cookie); i < names.length; i++) {
          var nb = enc.encode(names[i].n), need = 24 + nb.length;
          if (off + need > blen) { u.fill(0, buf + off, buf + blen); off = blen; break; }
          d.setBigUint64(buf + off, BigInt(i + 1), true); d.setBigUint64(buf + off + 8, 0n, true);
          d.setUint32(buf + off + 16, nb.length, true); d.setUint8(buf + off + 20, names[i].d ? 3 : 4);
          u.set(nb, buf + off + 24); off += need;
        }
        d.setUint32(used, off, true); return 0;
      },
      fd_fdstat_get: function (fd, out) {
        if (fds[fd]) { var dd = mem(); dd.setUint8(out, fds[fd].dir ? 3 : 4); dd.setUint16(out + 2, 0, true); dd.setBigUint64(out + 8, 0xFFFFFFFFFFFFFFFFn, true); dd.setBigUint64(out + 16, 0xFFFFFFFFFFFFFFFFn, true); return 0; }
        if (fd > 2) return EBADF;
        var d = mem(); d.setUint8(out, 2); d.setUint16(out + 2, 0, true); d.setBigUint64(out + 8, 0xFFFFFFFFn, true); d.setBigUint64(out + 16, 0xFFFFFFFFn, true); return 0;
      },
      proc_exit: function (code) { throw new ExitError(code); },
      random_get: function (p, n) { var u = u8().subarray(p, p + n); (root.crypto || require('node:crypto').webcrypto).getRandomValues(u); return 0; },
      sched_yield: function () { return 0; }
    };
    var imports = new Proxy({}, {
      get: function (t, name) { return table[name] || function () { return ENOSYS; }; },
      has: function () { return true; }
    });
    return {
      imports: { wasi_snapshot_preview1: imports },
      bind: function (i) { inst = i; },
      files: files,
      ExitError: ExitError
    };
  }
  var api = { makeWasi: makeWasi };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ZWasi = api;
})(typeof window !== 'undefined' ? window : globalThis);
