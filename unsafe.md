---
title: 手動メモリと unsafe
permalink: /unsafe/
lead: Zevic のメモリはふだん GC が管理します。その外で、自分でメモリを確保して返したいときのための機能です。ここにあるコードはすべて、実際にコンパイルして動かして確かめたものです。
alt: /en/unsafe/
---
> この機能は開発版（main）に入っていて、0.4.8 にはまだ含まれていません。次のリリースから使えます。

<div class="toc" markdown="1">
1. [いつ使うか](#u1)
2. [最初の例](#u2)
3. [操作の一覧](#u3)
4. [置ける型、置けない型](#u4)
5. [守ること](#u5)
6. [unsafe fn](#u6)
7. [安全な入れ物で包む](#u7)
</div>

## 1. いつ使うか {#u1}

ほとんどのプログラムは、`String` も配列もクラスも GC に任せれば足ります。`unsafe` が役に立つのは、次のようなときです。

- 数値だけの大きな表を、GC に調べさせず、確保と解放の時点を自分で決めたい
- C と共有するバッファを扱いたい
- アリーナやプールのような、寿命を自分で管理するデータ構造を作りたい

普通のプログラムでは使いません。**迷ったら使わない**のが正解です。

## 2. 最初の例 {#u2}

`unsafe { ... }` というブロックの中でだけ、手動のメモリが使えます。

```zevic
module Main

import Zevic.Console
import Zevic.Unsafe

fn Main() {
    unsafe {
        let p: *I64 = Unsafe.Alloc<I64>(3)   // I64 を 3 つ。中身は 0
        p.Write(0, 10)
        p.Write(1, 20)
        p.Offset(2).Write(0, 30)             // Offset(2) は 2 つ先
        Console.Println("${p.Read(0)} ${p.Read(1)} ${p.Read(2)}")
        Unsafe.Free(p)                       // 使い終わったら返す
    }
}
```

```text
10 20 30
```
{: .out}

- `Unsafe.Alloc<I64>(3)` は I64 を 3 つ置ける場所を確保して、ポインタ（`*I64`）を返します。中身は 0 で埋まっています
- `p.Write(i, v)` は i 番目に書き、`p.Read(i)` は i 番目を読みます。番号は**バイトではなく値の個数**で数えます
- `p.Offset(n)` は n 個先のポインタです
- 確保したものは `Unsafe.Free(p)` で返します。返さなければ、プログラムが終わるまで残ります（GC は回収しません）
- `Unsafe.Alloc` を使うには `import Zevic.Unsafe` が必要です

`unsafe { ... }` は普通のブロックなので、最後の式が値になります。`let n: I64 = unsafe { p.Read(0) }` のように書けます。

## 3. 操作の一覧 {#u3}

| 書き方 | 意味 |
| --- | --- |
| `Unsafe.Alloc<T>(n)` | T を n 個置ける場所を確保（ゼロ埋め）。メモリが足りなければ null ポインタ |
| `Unsafe.Free(p)` | 返す。`Alloc` が返したものだけに使う |
| `Unsafe.Cast<U>(p)` | 同じ番地を、別の型 `U` のポインタとして見る |
| `p.Read(i)` / `p.Write(i, v)` | i 番目の読み書き |
| `p.Offset(n)` | n 個先のポインタ |
| `p.IsNull()` | null か調べる。**これだけは `unsafe` の外でも使えます** |

ポインタの型は、C との連携で使う `*T` と同じです。C から受け取った `*T` にも `Read` / `Write` / `Offset` が使えます。

## 4. 置ける型、置けない型 {#u4}

手動のメモリには、**GC が管理する参照を置けません**。GC はこのメモリを調べないので、`String` やクラスの参照を置くと、まだ使っているのに GC に回収されてしまうからです。コンパイラが、確保や読み書きの時点で止めてくれます。

置けるのは、数値、`Bool`、`Char`、ポインタ、そしてそれだけでできた構造体・タプル・列挙型です。

```zevic
let p: *String = Unsafe.Alloc<String>(1)
```

```text
error: `String` holds a reference managed by the garbage collector, so it cannot be kept in manual memory (only numbers, `Bool`, `Char`, pointers, and structs, tuples and enums made of them)
```
{: .out}

置けないのは `String`、クラス、`Array`、関数、インターフェースなどです。大きさのない `Unit` と `CVoid` も置けません。`*CVoid` を受け取ったら、`Unsafe.Cast` で大きさのある型にしてから読み書きします。

`unsafe` の外で使うと、これもコンパイルエラーです。

```text
error: `Unsafe.Alloc` can only be used inside an `unsafe { ... }` block
```
{: .out}

## 5. 守ること {#u5}

`unsafe` の中で、コンパイラが調べてくれないことがあります。**調べるのはあなたの仕事です。**

- **範囲:** 確保した個数を超えた番号の `Read` / `Write` は、そのまま動いて、ほかのメモリを壊したり読んだりします
- **解放後の使用:** `Free` したポインタを読み書きしてはいけません
- **二重解放:** 同じポインタを 2 回 `Free` してはいけません（null の `Free` は何もしません）
- **返し忘れ:** `Free` しないと、終了まで残ります

これらを間違えても、エラーにならないことがあります。プログラムが突然おかしな値を出したり、止まったりします。だから、手動のメモリに触るコードは、できるだけ小さくまとめます。

## 6. unsafe fn {#u6}

注意が必要な関数は `unsafe fn` にできます。本体の中は丸ごと `unsafe` として扱われ、**呼べるのは `unsafe` のコードの中だけ**です。

```zevic
unsafe fn Total(p: *I64, n: I64) -> I64 {
    mut s: I64 = 0
    mut i: I64 = 0
    while (i < n) {
        s += p.Read(i)
        i += 1
    }
    s
}

fn Main() {
    let p: *I64 = unsafe { Unsafe.Alloc<I64>(3) }
    let t: I64 = unsafe { Total(p, 3) }
}
```

- 普通の関数にも、メソッドにも書けます（`static unsafe fn`、`mut unsafe fn` も可）
- `unsafe fn` の中からは、`unsafe { }` なしで別の `unsafe fn` を呼べます
- `unsafe` の外から呼ぶと、コンパイルエラーです

```text
error: `Danger` is an `unsafe fn`, so it can only be called inside an `unsafe { ... }` block or another `unsafe fn`
```
{: .out}

- `unsafe { }` の中に書いたラムダは、`unsafe` ではありません。ラムダの中で `unsafe fn` を呼ぶなら、そこでも `unsafe { }` が要ります
- `unsafe fn` は値として渡せません（`let f = Total` はエラー）。呼び出しの検査を迂回できてしまうからです
- インターフェースのメソッドは `unsafe` にできません

## 7. 安全な入れ物で包む {#u7}

`unsafe` の使い方でいちばん大切なのは、**範囲を確かめる安全な入れ物で包んで、外には安全な関数だけを見せる**ことです。危ないところが 1 か所に集まるので、見直しやすくなります。

```zevic
module Main

import Zevic.Console
import Zevic.Unsafe

// 範囲を確かめる安全な入れ物。unsafe は中に閉じ込める
struct IntBuffer {
    P: *I64
    Len: I64

    fn Init(len: I64) {
        this.P = unsafe { Unsafe.Alloc<I64>(len) }
        this.Len = len
    }

    fn Get(i: I64) -> Option<I64> {
        if (i < 0 || i >= this.Len) {
            return None
        }
        Some(unsafe { this.P.Read(i) })
    }

    fn Set(i: I64, v: I64) -> Bool {
        if (i < 0 || i >= this.Len) {
            return false
        }
        unsafe { this.P.Write(i, v) }
        true
    }

    fn Free() {
        unsafe { Unsafe.Free(this.P) }
    }
}

fn Main() {
    let b: IntBuffer = IntBuffer.New(3)
    b.Set(0, 100)
    b.Set(2, 300)
    Console.Println("${b.Set(3, 999)}")
    Console.Println("${b.Get(0).Unwrap()} ${b.Get(1).Unwrap()} ${b.Get(2).Unwrap()}")
    Console.Println("${b.Get(3).IsNone()}")
    b.Free()
}
```

```text
false
100 0 300
true
```
{: .out}

- `Get` と `Set` は、範囲を自分で確かめてから `unsafe` で読み書きします。範囲外は `None` や `false` を返すので、呼ぶ側に `unsafe` は要りません
- 確保したままの場所は 0 で埋まっているので、書かなかった 1 番は 0 です
- `Free` は呼ぶ側が忘れずに呼びます

もっと詳しい決まりは、[言語仕様](https://github.com/zevic-lang/zevic/blob/main/docs/spec/zevic-spec.md)の「Manual memory」と、[proposal 0011](https://github.com/zevic-lang/zevic/blob/main/docs/proposals/0011-unsafe.md) にあります。
