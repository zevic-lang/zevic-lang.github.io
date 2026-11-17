---
title: 他の言語から来た方へ
permalink: /from-other-languages/
lead: C / C++ / Rust / Go / Python / TypeScript などを書いたことがある方向けに、違いが出やすいところをまとめます。プログラミングが初めての方は、先に[はじめての Zevic](/start/)をどうぞ。
---
## 一目でわかる特徴

| 項目 | Zevic |
| --- | --- |
| 実行方式 | ネイティブにコンパイル（LLVM IR → clang） |
| 型 | 静的型。変数の**型と初期値は必須** |
| 変数 | `let`（不変・中身も変更不可）／`mut`（可変） |
| 式 | `if` `match` ブロックは値を返す式。最後の式が関数の戻り値 |
| 失敗の扱い | 例外なし。`Option` / `Result` と `?`。バグは `Panic` |
| null | なし（`Option`） |
| メモリ | GC（Boehm GC を同梱） |
| 型の定義 | `struct`（値型）／`class`（参照型）／`enum`（データを持てる）／`interface` |
| 継承 | なし。`interface` の実装とデフォルトメソッド |
| ジェネリクス | あり。型ごとに関数を生成する（単相化） |
| 並行処理 | `async` / `await`、`Async.Channel`、OS スレッド（`Thread.Spawn`） |
| C との連携 | `extern "C"` / `export "C"`。C のソースを一緒にビルド |
| 数値の型変換 | 暗黙の変換なし（`.ToI32()` などで明示） |
| オーバーフロー・0 除算 | `Panic` |

## 文法の見た目

```zevic
module Main

import Zevic.Console

struct Point {
    X: I32
    Y: I32
    fn Init(x: I32, y: I32) { this.X = x; this.Y = y }
    fn Dist2() -> I32 { this.X * this.X + this.Y * this.Y }
}

fn Main() {
    let p: Point = Point.New(3, 4)
    Console.Println("${p.Dist2()}")
}
```

- 条件は括弧で囲みます: `if (x > 0) { ... }`、`while (...)`、`for (x in xs)`、`match (v) { ... }`
- 値は `Point.New(...)` で作ります。`New` はコンパイラが `Init` から生成します（自分で定義するとエラー）
- 文字列の補間は `"${expr}"`
- モジュールの関数は `Console.Println` のように、モジュール名で修飾して呼びます

## 言語別メモ

### C / C++ から

- ヘッダーは要りません。C の関数は `extern "C" { fn puts(s: CString) -> CInt }` と宣言して呼びます。パラメーターと戻り値に使えるのは C の型だけで、`"hello".ToC()` や `String.FromC(p)` で変換します
- C のソースは `zevic main.zev native.c -o app` のように、一緒にコンパイルできます
- 逆に、Zevic の関数は `export "C" fn ...` で C から呼べます。`--emit-header` で C のヘッダーも作れます
- メモリは GC が管理します。`free` を呼ぶ必要はありません（C 側で確保したものの扱いは仕様書の「GC との境目」を参照）

```zevic
module Main

import Zevic.Console

extern "C" {
    fn call_twice(x: CInt) -> CInt
}

export "C" fn zv_double(x: CInt) -> CInt {
    (x.ToI32() * 2).ToCInt()
}

fn Main() {
    Console.Println("${call_twice(21.ToCInt()).ToI32()}")
}
```

```c
/* native.c */
extern int zv_double(int);
int call_twice(int x) { return zv_double(x); }
```

```sh
zevic main.zev native.c -o app && ./app
```

```text
42
```

### Rust から

- `match`、`enum`（データ付き）、`Option` / `Result`、`?` は同じ感覚で使えます。ただし `?` の使える関数は `Result<_, Error>` を返すものに限られ、エラー型は `Error` に固定です
- 借用チェッカーやライフタイムはありません。GC があります
- `struct` は値型でコピーされ、`class` は参照型です
- `trait` に当たるのは `interface` です。`impl` ブロックはなく、型の中にメソッドを書きます

### Go から

- GC、`defer`、`interface` は馴染み深いはずです。`interface` は型の宣言で `: Shape` のように実装を明示します
- `(value, err)` の組ではなく `Result<T, Error>` を返し、`?` で伝播します
- goroutine の代わりに `async { ... }` と `await`、`Async.Channel<T>`、`Thread.Spawn` があります

### Python / JavaScript / TypeScript から

- 静的型でコンパイルされます。型注釈は省略できません
- `None` / `undefined` の代わりに `Option<T>` を `match` で取り出します
- 例外はありません。ファイルが無い、数字でない文字列、などは `Result` で返ります
- 整数の型は `I32` / `I64` など幅つきで、混ぜるときは `.ToI64()` のように明示的に変換します

## つまずきやすい点

- `for (i in 0..5)` の `i` は `I64` です。`Array<I32>` には `i.ToI32()` で変換して入れます
- `let` の配列・Map には `Push` / `Set` できません。変更するなら `mut` にします
- 配列の範囲外アクセス（`xs[10]`）は Panic です。安全に読むなら `xs.Get(10)`（`Option`）
- `main` ではなく `Main`、関数名は大文字始まりが慣例です
- 既定の最適化は `-O0` です。速度を測るときは `zevic -O2` か `zevpm build --release`
