---
title: OS を書く
permalink: /os/
lead: Zevic は、ランタイムも GC も使わずにコンパイルできます。OS のカーネルやファームウェアのように、動かす土台が何もない場所で動くコードを、Zevic で書くためのモードです。
alt: /en/os/
---
> この機能は 0.6.0 から使えます。ここの例は、`examples/hello-os` として [リポジトリ](https://github.com/zevic-lang/zevic/tree/main/examples/hello-os)にあり、RISC-V のカーネルをビルドして確かめています。

<div class="toc" markdown="1">
1. [freestanding とは](#o1)
2. [Hello, World! を表示するカーネル](#o2)
3. [書けるもの、書けないもの](#o3)
4. [レジスタを読み書きする](#o4)
5. [zevic.toml に書く](#o5)
6. [失敗したときの動作: zevic_panic](#o6)
</div>

## 1. freestanding とは {#o1}

ふつうの Zevic のプログラムは、ランタイムと GC（Boehm）、そして C の標準ライブラリにリンクされます。OS を書くときは、そのどれもありません。`--freestanding` を付けると、

- ランタイムも GC も標準ライブラリもリンクしません
- 実行環境がない前提で、コードを作ります（レッドゾーンを使いません。RISC-V では `-mcmodel=medany` が付きます）
- `.S`（アセンブラ）と `.c` も入力にできます。起動のコードはアセンブラで書きます

C で OS を書くときと同じ道具立てで、言語だけが Zevic になります。

## 2. Hello, World! を表示するカーネル {#o2}

QEMU の RISC-V `virt` マシンの UART（シリアル）に、文字を書き出すだけのカーネルです。

```zevic
module Kernel

import Zevic.Unsafe

// QEMU virt の UART。volatile の書き込みは、コンパイラが消してはいけない書き込みです
let UartBase: U64 = 0x10000000

fn putc(c: U8) {
    unsafe {
        Unsafe.At<U8>(UartBase).WriteVolatile(0, c)
    }
}

// 文字列リテラルはイメージの中にあるので、ヒープは要りません
fn print(s: String) {
    mut i: I64 = 0
    while (i < s.Len()) {
        putc(s.ByteAt(i))
        i += 1
    }
}

export "C" fn zevic_panic(msg: *U8, len: CLongLong, file: *U8, line: CInt) {
    print("panic\n")
    while (true) {}
}

// native/boot.S から、スタックを用意したあとに呼ばれます
export "C" fn kmain() {
    print("Hello, World!\n")
}
```

最初に動くコード（`native/boot.S`）は、スタックを用意して `kmain` を呼ぶだけです。

```asm
.section .text.boot
.global _start
_start:
    la sp, stack_top
    call kmain
1:  wfi
    j 1b

.section .bss
.balign 16
stack_bottom:
    .skip 16384
.global stack_top
stack_top:
```

ビルドと実行です（`qemu-system-riscv64` が必要です）。

```sh
zevic --freestanding --target riscv64-unknown-elf -T linker.ld --entry _start \
    src/Main.zev native/boot.S -o kernel.elf
qemu-system-riscv64 -machine virt -bios none -kernel kernel.elf -nographic -serial stdio
```

```text
Hello, World!
```

- `-T`（`--linker-script`）はリンカスクリプト、`--entry` は入口のシンボル名です
- `--cflag` と `--ldflag` で、C コンパイラとリンカに渡す引数を足せます
- `-o kernel.o` のように `.o` を指定すると、リンクせずにオブジェクトだけを作ります

## 3. 書けるもの、書けないもの {#o3}

ランタイムが要るものは、**コンパイルエラー**になります。実行時に壊れるのではなく、書いた時点で分かります。

| 書ける | 書けない |
| --- | --- |
| 数値、`Bool`、`let` / `mut`、`struct`、ジェネリクス | `Array`、`Map`、`class`、クロージャ |
| ポインタ、`unsafe`、`Zevic.Unsafe` | 標準ライブラリのモジュール（`Fs`、`Console` など） |
| 文字列リテラルと、その `Len`・`ByteAt` | 文字列の連結や補間（ヒープが要ります） |

メモリが要るときは、リンカスクリプトで確保した領域などを、ポインタで自分で扱います（[`Unsafe`](/unsafe/) の `Read` と `Write`）。

## 4. レジスタを読み書きする {#o4}

メモリマップ I/O には、0.6.0 で次が加わりました。

- `Unsafe.At<T>(address)`: 数値のアドレスから、`*T` を作ります
- `p.Address()`: ポインタの数値を返します
- `p.ReadVolatile(i)` と `p.WriteVolatile(i, v)`: コンパイラに消されたり、まとめられたりしない読み書きです

デバイスのレジスタは、読むだけでも意味を持つことがあるので、`Read` / `Write` ではなく `ReadVolatile` / `WriteVolatile` を使ってください。

## 5. zevic.toml に書く {#o5}

`zevpm` のパッケージでも使えます。`zevic.toml` に `[freestanding]` を書くと、そのパッケージは freestanding になります。`kind = "bin"` のパッケージだけです。

```toml
[package]
name = "Kernel"
version = "0.1.0"
kind = "bin"

[freestanding]
target = "riscv64-unknown-elf"
linker_script = "linker.ld"
entry = "_start"
```

使えるキーは `target`、`linker_script`、`entry`、`cflags`、`ldflags` で、どれも省略できます。`zevpm build` で `build/Kernel.elf` ができます。ホストの上で動かすものではないので、`zevpm run` と `zevpm test` は、理由を言って断ります。

## 6. 失敗したときの動作: zevic_panic {#o6}

0 での割り算など、Zevic のコードが実行時の検査で失敗する場面があります。ふつうはメッセージを出して終了しますが、OS には終了する先がありません。

そこで、失敗する可能性のあるコードがあるときは、**`export "C" fn zevic_panic(msg: *U8, len: CLongLong, file: *U8, line: CInt)` を自分で書く**決まりです。UART に出す、止まる、再起動する、など、その環境にふさわしい動作を決めてください。書いていなければ、リンク時に分かります。
