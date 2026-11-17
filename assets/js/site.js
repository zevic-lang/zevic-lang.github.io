(function () {
  "use strict";
  var doc = document;

  // ---- menu and theme ----
  var nt = doc.querySelector(".nav-toggle"), nav = doc.getElementById("nav");
  if (nt && nav) nt.addEventListener("click", function () {
    var o = nav.classList.toggle("open"); nt.setAttribute("aria-expanded", o);
  });
  var tt = doc.querySelector(".theme-toggle");
  if (tt) tt.addEventListener("click", function () {
    var root = doc.documentElement;
    var cur = root.getAttribute("data-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
  });

  // ---- Zevic highlighter ----
  var KW = "module import as fn let mut class struct enum interface static Self extern export if else while loop for in match return break continue defer async await true false this test params".split(" ");
  var TY = "I8 I16 I32 I64 U8 U16 U32 U64 F32 F64 Bool Char String Unit Array Map Set Option Result Error ErrorKind StringBuilder Some None Ok Err Panic CInt CString CVoid CLongLong";
  var TYPES = {}; TY.split(" ").forEach(function (w) { TYPES[w] = 1; });
  var KWS = {}; KW.forEach(function (w) { KWS[w] = 1; });
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function span(c, s) { return '<span class="tok-' + c + '">' + esc(s) + "</span>"; }
  function hl(src) {
    var re = /(\/\/[^\n]*)|("(?:\\.|[^"\\\n])*")|('(?:\\.|[^'\\\n])')|(\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;
    var out = "", last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      if (m[1]) out += span("cm", m[1]);
      else if (m[2]) out += hlStr(m[2]);
      else if (m[3]) out += span("str", m[3]);
      else if (m[4]) out += span("num", m[4]);
      else {
        var w = m[5];
        if (KWS[w]) out += span("kw", w);
        else if (TYPES[w] || /^[A-Z][a-z0-9]/.test(w) && src.charAt(m.index + w.length) !== "(") out += span("ty", w);
        else out += esc(w);
      }
      last = re.lastIndex;
    }
    return out + esc(src.slice(last));
  }
  // string with ${...} interpolation highlighted as code
  function hlStr(s) {
    var out = "", i = 0;
    while (i < s.length) {
      var j = s.indexOf("${", i);
      if (j < 0) { out += span("str", s.slice(i)); break; }
      out += span("str", s.slice(i, j));
      var depth = 1, k = j + 2;
      while (k < s.length && depth) { if (s[k] === "{") depth++; else if (s[k] === "}") depth--; k++; }
      out += '<span class="tok-kw">${</span>' + esc(s.slice(j + 2, k - 1)) + '<span class="tok-kw">}</span>';
      i = k;
    }
    return out;
  }
  doc.querySelectorAll(".language-zevic pre code, pre code.language-zevic").forEach(function (c) {
    c.innerHTML = hl(c.textContent);
  });

  // ---- copy buttons ----
  doc.querySelectorAll("pre").forEach(function (pre) {
    if (pre.closest(".out")) return;
    var host = pre.closest(".highlighter-rouge") || pre;
    var wrap = doc.createElement("div"); wrap.className = "codewrap";
    host.parentNode.insertBefore(wrap, host); wrap.appendChild(host);
    var b = doc.createElement("button"); b.className = "copy"; b.type = "button"; b.textContent = "コピー";
    b.addEventListener("click", function () {
      var t = pre.innerText.replace(/\n$/, "");
      var done = function () { b.textContent = "コピーしました"; setTimeout(function () { b.textContent = "コピー"; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () {});
    });
    wrap.appendChild(b);
  });
})();
