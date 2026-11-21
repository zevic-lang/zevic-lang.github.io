#!/bin/sh
# Builds what the playground runs: runtime.wasm (the C runtime of zevic), zevic.wasm (the compiler)
# and stdlib.json (the standard library sources). Needs wasi-sdk and a checkout of zevic.
#   WASI_SDK=/opt/wasi-sdk-25.0-x86_64-linux sh _tools/build-playground.sh /path/to/zevic
set -eu
ZEVIC="${1:?usage: build-playground.sh <zevic checkout>}"
CC="${WASI_SDK:?set WASI_SDK}/bin/clang"
OUT="$(cd "$(dirname "$0")/.." && pwd)/assets/playground"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
"$CC" -c -O2 -w "$ZEVIC/runtime/zevic_rt.c" -o "$TMP/rt.o"
# runtime.wasm: a library (no main) that exports everything; the generated programs run in ZIR on its memory
"$CC" -mexec-model=reactor "$TMP/rt.o" -o "$OUT/runtime.wasm" -lm -Wl,--export-all,--allow-undefined,--no-gc-sections
# zevic.wasm: the compiler, from its bootstrap IR (wasi-libc calls __main_argc_argv)
sed 's/^define i32 @main(/define i32 @__main_argc_argv(/' "$ZEVIC/bootstrap/zevic.ll" > "$TMP/zevic.ll"
"$CC" --target=wasm32-wasi -O2 -w -c "$TMP/zevic.ll" -o "$TMP/zevic.o"
"$CC" "$TMP/rt.o" "$TMP/zevic.o" -o "$OUT/zevic.wasm" -lm -Wl,--allow-undefined,--stack-first,-z,stack-size=8388608
python3 - "$ZEVIC" "$OUT/stdlib.json" <<'PY'
import json, os, sys
root, out = sys.argv[1], sys.argv[2]
files = {"runtime/zevic_rt.c": ""}
base = os.path.join(root, "packages", "Zevic")
for d, _, names in os.walk(base):
    for n in sorted(names):
        p = os.path.join(d, n)
        files[os.path.relpath(p, root).replace(os.sep, "/")] = open(p, encoding="utf-8").read()
json.dump({"version": open(os.path.join(root, "VERSION")).read().strip(), "files": files}, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
PY
ls -l "$OUT"/runtime.wasm "$OUT"/zevic.wasm "$OUT"/stdlib.json
