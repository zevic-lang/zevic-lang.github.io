// Zevic playground: the page. The engine (compile + run) is assets/playground/engine.js,
// which sets window.ZevicEngine = { load(report), run(source, out) }.
(function () {
  var root = document.getElementById('pg');
  if (!root) return;
  var base = root.getAttribute('data-base');
  var ja = root.getAttribute('data-lang') === 'ja';
  var $ = function (id) { return document.getElementById(id); };
  var src = $('pg-src'), out = $('pg-out'), run = $('pg-run'), status = $('pg-status'), sel = $('pg-examples');
  var T = ja
    ? { ready: '準備できました', running: '実行中…', done: '終了', failed: '失敗', noEngine: 'エンジンがまだ組み込まれていません', copied: 'リンクをコピーしました', custom: '(共有されたコード)', exit: '終了コード' }
    : { ready: 'Ready', running: 'Running…', done: 'Done', failed: 'Failed', noEngine: 'The engine is not built in yet', copied: 'Link copied', custom: '(shared code)', exit: 'exit code' };

  function put(text, cls) {
    var s = document.createElement('span');
    if (cls) s.className = cls;
    s.textContent = text;
    out.appendChild(s);
    out.scrollTop = out.scrollHeight;
  }
  function setStatus(t) { status.textContent = t; }

  // sharing: the code is in the URL hash (base64 of UTF-8), so no server is needed
  function encode(text) {
    var b = new TextEncoder().encode(text), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(h) {
    var s = atob(h.replace(/-/g, '+').replace(/_/g, '/'));
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return new TextDecoder().decode(b);
  }

  var examples = [];
  fetch(base + 'examples.json').then(function (r) { return r.json(); }).then(function (list) {
    examples = list;
    list.forEach(function (e, i) {
      var o = document.createElement('option');
      o.value = i; o.textContent = e.title; sel.appendChild(o);
    });
    var m = /^#code=(.+)$/.exec(location.hash);
    if (m) {
      try { src.value = decode(m[1]); var o = document.createElement('option'); o.value = 'custom'; o.textContent = T.custom; sel.insertBefore(o, sel.firstChild); sel.value = 'custom'; return; } catch (e) { /* fall through */ }
    }
    src.value = list[0].source;
  });
  sel.addEventListener('change', function () {
    if (sel.value !== 'custom') src.value = examples[+sel.value].source;
  });

  $('pg-share').addEventListener('click', function () {
    var url = location.origin + location.pathname + '#code=' + encode(src.value);
    history.replaceState(null, '', url);
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { setStatus(T.copied); });
    else setStatus(url);
  });

  // Tab inserts four spaces
  src.addEventListener('keydown', function (e) {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      var a = src.selectionStart, b = src.selectionEnd;
      src.setRangeText('    ', a, b, 'end');
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); doRun();
    }
  });

  var busy = false;
  function doRun() {
    var E = window.ZevicEngine;
    if (busy || !E) return;
    busy = true; run.disabled = true; out.textContent = ''; setStatus(T.running);
    var t0 = performance.now();
    Promise.resolve(E.run(src.value, {
      stdout: function (t) { put(t); },
      stderr: function (t) { put(t, 'err'); },
      info: function (t) { put(t, 'info'); }
    })).then(function (code) {
      var ms = Math.round(performance.now() - t0);
      if (code !== undefined && code !== 0) put('\n[' + T.exit + ' ' + code + ']\n', 'err');
      setStatus((code === 0 || code === undefined ? T.done : T.failed) + ' · ' + ms + ' ms');
    }, function (err) {
      put(String(err && err.message || err) + '\n', 'err'); setStatus(T.failed);
    }).then(function () { busy = false; run.disabled = false; });
  }
  run.addEventListener('click', doRun);

  // the engine
  var s = document.createElement('script');
  s.src = base + 'engine.js';
  s.onload = function () {
    var E = window.ZevicEngine;
    if (!E) { setStatus(T.noEngine); return; }
    Promise.resolve(E.load(function (t) { setStatus(t); })).then(function () {
      run.disabled = false; setStatus(T.ready);
    }, function (err) { setStatus(T.failed); put(String(err && err.message || err) + '\n', 'err'); });
  };
  s.onerror = function () { setStatus(T.noEngine); };
  document.head.appendChild(s);
})();
