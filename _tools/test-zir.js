// node _tools/test-zir.js <runtime.wasm> <file.ll> [expected.txt]
const fs = require('fs');
const ZIR = require('../assets/playground/zir.js');
const { makeWasi } = require('../assets/playground/wasi.js');
(async () => {
  const [rtPath, llPath, expPath] = process.argv.slice(2);
  let out = '';
  const dec = new TextDecoder();
  const w = makeWasi({ stdout: b => { out += dec.decode(b); }, stderr: b => { process.stderr.write(b); } });
  const { instance } = await WebAssembly.instantiate(fs.readFileSync(rtPath), w.imports);
  w.bind(instance);
  if (instance.exports._initialize) instance.exports._initialize();
  const t0 = Date.now();
  const prog = ZIR.load(fs.readFileSync(llPath, 'utf8'), instance);
  let code;
  try { code = prog.call('main', [0, 0]); } catch (e) { if (e instanceof w.ExitError) code = e.code; else { console.error(e.stack); process.exit(2); } }
  if (instance.exports.fflush) instance.exports.fflush(0);
  if (expPath) {
    const exp = fs.readFileSync(expPath, 'utf8');
    if (exp === out) console.log('ok  ' + llPath + ' (' + (Date.now() - t0) + ' ms)');
    else { console.log('DIFF ' + llPath + ' exit ' + code); console.log('--- got'); console.log(out.slice(0, 600)); console.log('--- want'); console.log(exp.slice(0, 600)); process.exit(1); }
  } else { process.stdout.write(out); console.log('[exit ' + code + ']'); }
})();
