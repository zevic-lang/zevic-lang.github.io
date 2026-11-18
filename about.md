---
title: 概要
permalink: /about/
lead: Zevic は、C のコードをそのまま使える、小さくて書きやすいネイティブ言語です。
alt: /en/about/
---
## 設計の考え方

Zevic は、ソースコードを**テキストの LLVM IR** に変換し、機械語の生成を `clang` に任せます。自前のバックエンドは持たず、その代わりに言語とコンパイラを小さく保っています。

- **書きやすさ**: 型は必ず書き、初期値のない変数はありません。`if` と `match` は値を返す式です
- **安全側の既定**: 変数は `let`（不変）が基本で、変えたいものだけ `mut` にします。null も例外もありません
- **C との境目が明確**: C の型（`CInt` `CString` など）は明示的に変換します。暗黙の変換はありません
- **GC 付き**: Boehm GC を同梱しています。C との境目でのメモリの扱いは言語仕様に書かれています

## しくみ

```text
.zev ソース
  → zevic（字句解析・構文解析・型検査）
  → LLVM IR（テキスト）
  → clang ← ランタイム・Boehm GC・C のソース
  → 実行ファイル
```

`zevic` は clang を次の順に探します: `--cc`、環境変数 `ZEVIC_CLANG`、`PATH` 上の `clang`、そして Homebrew や `/usr/lib/llvm-*/bin` などの既定の場所。clang 15 以上が必要です。

## セルフホスト

コンパイラ（`tools/zevic1/`、約 13,000 行の Zevic）は Zevic 自身で書かれています。`zevic1` が自分自身をビルドして得た LLVM IR は、世代を重ねてもバイト単位で同じです。この IR は `bootstrap/zevic.ll` としてリポジトリに入っており、**clang だけ**でコンパイラを一から作れます。

最初の実装は C で書かれていました（[zevic-c](https://github.com/zevic-lang/zevic-c)、現在はアーカイブ）。

## 道具

| ツール | 役割 |
| --- | --- |
| `zevic` | コンパイラ。`zevic hello.zev -o hello` |
| `zevpm` | パッケージ・ビルド・テスト。`zevpm new` `run` `test` `get` `build --release` |
| `zevfmt` | 整形。`zevfmt -w .` で書き換え、`zevfmt -check .` で検査 |

## 標準ライブラリ

標準ライブラリは `Zevic` パッケージとして提供され、次のモジュールがあります。

`Async` `BigInt` `Bytes` `Chars` `Cli` `Console` `Convert` `Csv` `DateTime` `Deflate` `Digest` `Encoding` `Env` `Fs` `Gzip` `Http` `Json` `Log` `Math` `Net` `Path` `Process` `Random` `Regex` `Tar` `Test` `Text` `Thread` `Time` `Toml` `Zip` `Zlib`

## 現在の状況

バージョン {{ site.version }}。型、`struct` / `class` / `enum`、共用体型、`interface`、ジェネリクス、クロージャ、`defer`、GC、C との連携、`test` ブロック、`async` / `await`、HTTP（TLS なし）、`zevpm` と標準ライブラリが動作しています。開発中の言語なので、仕様は今後も変わります。詳しくは[リリース](/releases/)と[言語仕様](https://github.com/zevic-lang/zevic/blob/main/docs/spec/zevic-spec.md)をご覧ください。

## ライセンス

Apache License 2.0。
