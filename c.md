---
title: C と一緒に使う
permalink: /c/
lead: Zevic は「C との境目がない」ことを目指しています。C のヘッダを読み込めば、その関数・構造体・定数がそのまま Zevic から使えます。C のコードを 1 行も書かずに、sqlite や zlib のようなライブラリを呼べます。ここにあるコードは、実際にコンパイルして動かして確かめたものです。
alt: /en/c/
---
> この機能は 0.6.0 から使えます。`import C` と `zevic bind` には clang が必要です（Zevic のビルドに使うものと同じです）。

<div class="toc" markdown="1">
1. [考え方](#c1)
2. [import C: ヘッダを読み込む](#c2)
3. [型の対応](#c3)
4. [構造体の値渡し](#c4)
5. [コールバック](#c5)
6. [zevic bind: ファイルに書き出す](#c6)
7. [束縛できないもの](#c7)
8. [OS を書くとき](#c8)
</div>

## 1. 考え方 {#c1}

今までの Zevic でも、C の関数は `extern "C"` で宣言すれば呼べました。ただ、宣言を 1 つずつ手で書く必要があり、構造体を値で渡す関数やマクロには、C で書いた薄い橋渡し（シム）が要りました。

0.6.0 では、この手作業をなくしました。

- `import C "ヘッダ" as 名前` は、コンパイル時に clang がヘッダを読み、そのモジュールを自動で作ります
- 構造体の値渡しに必要な C のシムは、コンパイラが自分で書いて一緒にコンパイルします
- `#define` の数値や文字列、`enum` は、`let` の定数になります

目標は、ライブラリのラッパーパッケージが **C のコードを 0 行**にできることです。実際に [sqlite パッケージ](https://github.com/zevic-lang/sqlite)は、64 行あった C のシムをやめて、`import C "sqlite3.h"` だけで動いています。

## 2. import C: ヘッダを読み込む {#c2}

```zevic
module Main

import C "sqlite3.h" as Sq strip "sqlite3_", "SQLITE_"
import Zevic.Console

fn Main() {
    let v: CString = Sq.Libversion()
    Console.Println("SQLite ${String.FromC(v)}")
    Console.Println("${Sq.SqliteOk} ${Sq.Row} ${Sq.Done}")
}
```

```sh
zevic main.zev -lsqlite3 -o main
./main
```

```text
SQLite 3.45.1
0 100 101
```

- `import C "sqlite3.h" as Sq` で、モジュール `Sq` ができます。ヘッダは、そのファイルの隣、カレントディレクトリ、`-I` で渡したディレクトリ、の順に探します
- `strip "sqlite3_", "SQLITE_"` は、名前の先頭から取り除く接頭辞です。`sqlite3_libversion` が `Sq.Libversion` に、`SQLITE_ROW` が `Sq.Row` になります（大文字小文字は区別しません）
- 標準の名前とぶつかる場合は、接頭辞が残ります。`SQLITE_OK` は `Ok` ではなく `SqliteOk` です
- そのヘッダ自身が宣言したものだけが対象で、ヘッダが `#include` している先のものは含みません

`zevpm` のパッケージでは、`zevic.toml` の `[native]` に `libs = ["sqlite3"]` や `include_dirs` を書きます。

## 3. 型の対応 {#c3}

| C | Zevic |
| --- | --- |
| `int` `long` `unsigned char` など | `CInt` `CLong` `CUChar` など |
| `size_t` | `CSizeT` |
| `const char *` | `CString` |
| `int *`, `struct S *` | `*CInt`, `*S` |
| 中身の見えないポインタ（`sqlite3 *` など） | `*CVoid` |
| 関数ポインタ | `fn(...) -> ...` |
| `enum` | `CInt`（値は `let` の定数） |
| `struct` | `struct`（フィールドは C と同じ並び） |

C の型と Zevic の型は、これまでどおり明示的に変換します（`.ToI32()`、`.ToCInt()`）。暗黙の変換はありません。

## 4. 構造体の値渡し {#c4}

raylib のように、`Vector2` や `Color` を値で渡し、値で返す C のライブラリは多くあります。C の呼び出し規約は環境ごとに違い、手で合わせるのは間違えやすいところです。

Zevic は、**C のコンパイラに任せます**。たとえば次の C のヘッダがあるとします。

```c
typedef struct { float x, y; } Vector2;
typedef struct { unsigned char r, g, b, a; } Color;
Vector2 Vector2Add(Vector2 a, Vector2 b);
void ClearBackground(Color c);
```

`import C` は、次のような C の関数を内部で書いてコンパイルします。

```c
void zevic_shim_Vector2Add(Vector2 *a, Vector2 *b, Vector2 *out) { *out = Vector2Add(*a, *b); }
```

使う側には、ふつうの値渡しの関数に見えます。

```zevic
import C "mini.h" as Rl

fn Main() {
    let a: Rl.Vector2 = Rl.Vector2.New(1.0.ToCFloat(), 2.0.ToCFloat())
    let s: Rl.Vector2 = Rl.Vector2Add(a, a)
    Rl.ClearBackground(Rl.Color.New(255.ToCUChar(), 0.ToCUChar(), 0.ToCUChar(), 255.ToCUChar()))
}
```

シムのファイルは作業ディレクトリには残りません（一時ディレクトリに書かれます）。

## 5. コールバック {#c5}

関数ポインタの引数は、Zevic の関数をそのまま渡せます。何も渡さない（C の `NULL`）ときは `Null` です。

```zevic
fn twice(i: CInt) -> CInt {
    (i.ToI32() * 2).ToCInt()
}

fn Main() {
    Lib.Run(Null)       // C には NULL が渡る
    Lib.Run(twice)
}
```

C には、関数ポインタに**番号を入れて**意味を持たせるものがあります。sqlite の `SQLITE_TRANSIENT`（`-1`）や、シグナルの `SIG_IGN` がそうです。そのための `Unsafe.CallbackAt` があります。

```zevic
import Zevic.Unsafe

// C に渡すためだけに使えます。Zevic から呼んではいけません
let Transient: fn(*CVoid) -> CVoid = Unsafe.CallbackAt<fn(*CVoid) -> CVoid>(-1)
```

## 6. zevic bind: ファイルに書き出す {#c6}

`import C` は、毎回コンパイル時に読み込みます。**生成されたモジュールを見たい・手で直したい**ときは、`zevic bind` でファイルに書き出せます。

```sh
zevic bind sqlite3.h --module Sqlite3 --strip-prefix sqlite3_ --strip-prefix SQLITE_ -o src/Sqlite3.zev
```

出力は `extern "C" { ... }` のブロックと、`struct`、`let` の定数が並ぶふつうのテキストです。構造体の値渡しがあるヘッダでは、シムの置き場所として `--shims shim.c` が必要です（`shim.c` は一緒にコンパイルします）。`-I` と `-D` は clang にそのまま渡されます。

## 7. 束縛できないもの {#c7}

束縛できなかったものは、`zevic bind` が出力の最後に、理由つきで一覧にします。`import C` ではその関数が単に使えません。

- 可変長引数の関数（`printf` など）。通常の引数だけを取る小さな関数を、自分で `extern "C"` で宣言してください
- 値渡しの構造体とコールバックを同時に取る関数
- 共用体（`union`）、ビットフィールド、`long double`
- 数値や文字列の定数でない、式のあるマクロ

## 8. OS を書くとき {#c8}

C と同じ土俵で使えるのは、ライブラリだけではありません。ランタイムも GC も使わずにコンパイルして、OS のカーネルやファームウェアを Zevic で書くこともできます。[OS を書く](/os/)をご覧ください。
