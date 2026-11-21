// node _tools/compile-test.js <zevic.wasm> <runtime.wasm> <zevic-home> <file.zev>: compile with zevic.wasm, run with ZIR
const fs = require('fs'), path = require('path');
const ZIR = require('../assets/playground/zir.js');
const { makeWasi } = require('../assets/playground/wasi.js');
function walk(dir, base, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base + '/' + e.name, out); else out[base + '/' + e.name] = fs.readFileSync(p);
  });
}
(async () => {
  const [zw, rw, home, src] = process.argv.slice(2);
  const files = { '/zhome/runtime/zevic_rt.c': '' };
  walk(path.join(home, 'packages/Zevic'), '/zhome/packages/Zevic', files);
  files['/work/main.zev'] = fs.readFileSync(src);
  const dec = new TextDecoder(); let cerr = '';
  const w = makeWasi({ args: ['zevic', '--emit-ll', '/work/main.zev', '-o', '/work/main.ll'], env: { ZEVIC_HOME: '/zhome' }, files, preopens: ['/zhome', '/work'],
    stdout: b => { cerr += dec.decode(b); }, stderr: b => { cerr += dec.decode(b); } });
  const t0 = Date.now();
  const zi = (await WebAssembly.instantiate(fs.readFileSync(zw), w.imports)).instance; w.bind(zi);
  let code; try { code = zi.exports._start(); } catch (e) { if (e instanceof w.ExitError) code = e.code; else throw e; }
  console.error('compile: exit', code, (Date.now() - t0) + ' ms'); if (cerr) console.error(cerr);
  if (code !== 0) process.exit(1);
  const ll = dec.decode(w.files['/work/main.ll']);
  let out = '';
  const w2 = makeWasi({ stdout: b => { out += dec.decode(b); }, stderr: b => { process.stderr.write(b); } });
  const ri = (await WebAssembly.instantiate(fs.readFileSync(rw), w2.imports)).instance; w2.bind(ri);
  ri.exports._initialize();
  const t1 = Date.now();
  const prog = ZIR.load(ll, ri); let c2;
  try { c2 = prog.call('main', [0, 0]); } catch (e) { if (e instanceof w2.ExitError) c2 = e.code; else throw e; }
  ri.exports.fflush(0);
  process.stdout.write(out); console.error('run: exit', c2, (Date.now() - t1) + ' ms');
})();
