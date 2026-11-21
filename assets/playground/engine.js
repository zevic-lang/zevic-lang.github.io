// The playground engine: zevic.wasm compiles the source to LLVM IR, ZIR runs the IR on the memory of
// runtime.wasm. All of it runs in the page; nothing is sent anywhere.
(function () {
  'use strict';
  var script = document.currentScript || document.querySelector('script[src$="engine.js"]');
  var base = script.src.replace(/engine\.js.*$/, '');
  var dec = new TextDecoder(), enc = new TextEncoder();
  var zevicModule, runtimeModule, stdlib;

  function loadScript(name) {
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = base + name; s.onload = ok; s.onerror = function () { fail(new Error('cannot load ' + name)); };
      document.head.appendChild(s);
    });
  }
  function compile(name) {
    return fetch(base + name).then(function (r) {
      if (!r.ok) throw new Error('cannot load ' + name);
      return WebAssembly.compileStreaming ? WebAssembly.compileStreaming(r.clone()).catch(function () { return r.arrayBuffer().then(WebAssembly.compile); }) : r.arrayBuffer().then(WebAssembly.compile);
    });
  }

  window.ZevicEngine = {
    load: function (report) {
      report('…');
      return Promise.all([loadScript('wasi.js'), loadScript('zir.js')]).then(function () {
        return Promise.all([
          compile('zevic.wasm').then(function (m) { zevicModule = m; }),
          compile('runtime.wasm').then(function (m) { runtimeModule = m; }),
          fetch(base + 'stdlib.json').then(function (r) { return r.json(); }).then(function (j) { stdlib = j; })
        ]);
      });
    },

    run: function (source, out) {
      var files = {};
      Object.keys(stdlib.files).forEach(function (k) { files['/zhome/' + k] = enc.encode(stdlib.files[k]); });
      files['/work/main.zev'] = enc.encode(source);
      var cerr = '';
      var w = ZWasi.makeWasi({
        args: ['zevic', '--emit-ll', '/work/main.zev', '-o', '/work/main.ll'], env: { ZEVIC_HOME: '/zhome' },
        files: files, preopens: ['/zhome', '/work'],
        stdout: function (b) { cerr += dec.decode(b); }, stderr: function (b) { cerr += dec.decode(b); }
      });
      return WebAssembly.instantiate(zevicModule, w.imports).then(function (zi) {
        w.bind(zi);
        var code = 0;
        try { zi.exports._start(); } catch (e) { if (e instanceof w.ExitError) code = e.code; else throw e; }
        if (code !== 0 || !w.files['/work/main.ll']) {
          out.stderr((cerr || 'the compiler failed') .replace(/\/work\/main\.zev/g, 'main.zev'));
          return code || 1;
        }
        if (cerr) out.stderr(cerr.replace(/\/work\/main\.zev/g, 'main.zev'));
        var ll = dec.decode(w.files['/work/main.ll']);
        var w2 = ZWasi.makeWasi({ stdout: function (b) { out.stdout(dec.decode(b, { stream: true })); }, stderr: function (b) { out.stderr(dec.decode(b)); } });
        return WebAssembly.instantiate(runtimeModule, w2.imports).then(function (ri) {
          w2.bind(ri);
          ri.exports._initialize();
          var prog = ZIR.load(ll, ri), c2 = 0;
          try { c2 = prog.call('main', [0, 0]); }
          catch (e) {
            if (e instanceof w2.ExitError) c2 = e.code;
            else if (e instanceof RangeError && /call stack/.test(e.message)) { out.stderr('stack overflow: the recursion is too deep for the playground\n'); c2 = 1; }
            else throw e;
          }
          if (ri.exports.fflush) ri.exports.fflush(0);
          return c2;
        });
      });
    }
  };
})();
