---
title: はじめての Zevic
permalink: /start/
lead: プログラミングが初めての方向けに、1 ページで Zevic の基本を一通り動かします。ここにあるコードはすべて、実際にコンパイルして動かして確かめたものです。
alt: /en/start/
---
<div class="toc" markdown="1">
1. [準備](#s1)
2. [Hello, World](#s2)
3. [変数と型](#s3)
4. [関数と配列](#s4)
5. [失敗を扱う: Option と Result](#s5)
6. [関数を値として渡す](#s6)
7. [テストを書く](#s7)
8. [次のステップ](#s8)
</div>

## 1. 準備 {#s1}

[インストール](/install/)を済ませ、`zevic --version` が動くことを確かめてください。プログラムは `.zev` という拡張子のファイルに書きます。エディターは何でも構いません。

## 2. Hello, World {#s2}

`hello.zev` を作ります。

```zevic
module Main

import Zevic.Console

fn Main() {
    Console.Println("Hello, World!")
}
```

コンパイルして実行します。

```sh
zevic hello.zev -o hello
./hello
```

```text
Hello, World!
```
{: .out}

- `module Main` は、このファイルがプログラムの入口のモジュールであることを表します
- `import Zevic.Console` で、画面への入出力を行う標準ライブラリを使えるようにします
- `fn Main()` が、プログラムの実行が始まる場所です
- `Console.Println(...)` は、文字列を 1 行表示します

## 3. 変数と型 {#s3}

変数は `let`（あとから変えられない）か `mut`（変えられる）で宣言します。**型と初期値は必ず書きます。**

```zevic
module Main

import Zevic.Console

fn Main() {
    let name: String = "Zevic"
    let year: I32 = 2026
    mut count: I32 = 0
    count += 1
    let pi: F64 = 3.14
    let ok: Bool = true
    Console.Println("${name} ${year} ${count} ${pi} ${ok}")
}
```

```text
Zevic 2026 1 3.14 true
```
{: .out}

- 文字列の中の `${ ... }` には式を書け、その値が文字列に埋め込まれます
- 主な型: 整数は `I8` `I16` `I32` `I64`（符号なしは `U8` ... `U64`）、小数は `F32` `F64`、ほかに `Bool` `Char` `String`
- `let` の変数は、中身も変えられません（配列に `Push` することもできません）。変えたいものは `mut` にします

## 4. 関数と配列 {#s4}

```zevic
module Main

import Zevic.Console

fn Square(n: I32) -> I32 {
    n * n
}

fn Sum(xs: Array<I32>) -> I32 {
    mut total: I32 = 0
    for (x in xs) {
        total += x
    }
    total
}

fn Main() {
    let nums: Array<I32> = [1, 2, 3, 4, 5]
    Console.Println("${Square(7)}")
    Console.Println("sum = ${Sum(nums)}")
    mut xs: Array<I64> = []
    for (i in 0..5) {
        xs.Push(i * i)
    }
    Console.Println("${xs.Len()} items, first ${xs[0]}, last ${xs[4]}")
}
```

```text
49
sum = 15
5 items, first 0, last 16
```
{: .out}

- 関数は `fn 名前(引数: 型) -> 戻り値の型 { ... }`。**最後の式の値**が戻り値になります（`return` は省略できます）
- `0..5` は 0 から 4 まで、`0..=5` は 5 までを含む範囲です
- `for (i in 0..5)` の `i` は `I64` です。`Array<I32>` に入れたいときは `i.ToI32()` のように、**明示的に型を変換**します

## 5. 失敗を扱う: Option と Result {#s5}

Zevic には例外も null もありません。「無いかもしれない」は `Option`、「失敗するかもしれない」は `Result` で表します。

```zevic
module Main

import Zevic.Console

enum Shape {
    Circle(F64),
    Rect(F64, F64),

    fn Area() -> F64 {
        match (this) {
            Shape.Circle(r) => 3.14 * r * r,
            Shape.Rect(w, h) => w * h,
        }
    }
}

fn Half(n: I32) -> Result<I32, Error> {
    if (n % 2 != 0) {
        return Err(Error.New(ErrorKind.Invalid, "${n} is odd"))
    }
    Ok(n / 2)
}

fn Quarter(n: I32) -> Result<I32, Error> {
    let h: I32 = Half(n)?
    Half(h)
}

fn Main() {
    Console.Println("${Shape.Rect(2.0, 3.0).Area()}")
    match (Quarter(12)) {
        Ok(v) => Console.Println("ok ${v}"),
        Err(e) => Console.Println("error: ${e.Message()}"),
    }
    match (Quarter(6)) {
        Ok(v) => Console.Println("ok ${v}"),
        Err(e) => Console.Println("error: ${e.Message()}"),
    }
    let words: Array<String> = ["a", "bb"]
    match (words.Get(5)) {
        Some(w) => Console.Println(w),
        None => Console.Println("no such item"),
    }
}
```

```text
6.0
ok 3
error: 3 is odd
no such item
```
{: .out}

- `enum` は、いくつかの形のどれかを表す型です。`match` で形ごとに処理を分けます。すべての形を網羅しないとコンパイルエラーになります
- `expression?` は、`Ok(x)` なら `x` を取り出し、`Err` ならその場で関数から返します
- 配列の範囲外を `xs[10]` と読むのはバグなので `Panic`（プログラムの停止）になります。範囲外かもしれないときは `Get` で `Option` として受け取ります

## 6. 関数を値として渡す {#s6}

```zevic
module Main

import Zevic.Console

fn Main() {
    let nums: Array<I32> = [1, 2, 3, 4, 5, 6]
    let double: fn(I32) -> I32 = (x: I32) => x * 2
    Console.Println("${double(21)}")
    mut total: I32 = 0
    nums.Each((x: I32) => { total += x })
    Console.Println("total ${total}")
    mut m: Map<String, I32> = Map.New()
    m.Set("a", 1)
    m.Set("b", 2)
    match (m.Get("b")) {
        Some(v) => Console.Println("b = ${v}"),
        None => Console.Println("none"),
    }
}
```

```text
42
total 21
b = 2
```
{: .out}

`(x: I32) => x * 2` は無名関数（ラムダ）です。外側の `mut` 変数を取り込め、変更は外側にも見えます。

## 7. テストを書く {#s7}

`test "名前" { ... }` ブロックを書くと、`zevpm test` で実行されます。

```zevic
module Main

import Zevic.Console

fn Add(a: I32, b: I32) -> I32 { a + b }

test "Add adds" {
    if (Add(2, 3) != 5) { Panic("bad") }
}

fn Main() {
    Console.Println("${Add(2, 3)}")
}
```

プロジェクトは `zevpm` で作ります。

```sh
zevpm new myapp
cd myapp
zevpm run        # ビルドして実行
zevpm test       # テストを実行
zevfmt -w .      # コードを整形
```

## 8. 次のステップ {#s8}

- `struct` / `class` / `interface` — [examples の 05_shapes](https://github.com/zevic-lang/zevic/blob/main/examples/05_shapes/src/Main.zev)
- ファイル・外部プログラム・JSON・HTTP — [examples](https://github.com/zevic-lang/zevic/tree/main/examples)
- 手動メモリ — [手動メモリと unsafe](/unsafe/)（0.5.0 から）
- C との連携 — [06_c_interop](https://github.com/zevic-lang/zevic/tree/main/examples/06_c_interop)
- [言語仕様](https://github.com/zevic-lang/zevic/blob/main/docs/spec/zevic-spec.md)
- 他の言語を知っている方は[他言語からの入門](/from-other-languages/)も。
