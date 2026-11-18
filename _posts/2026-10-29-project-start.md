---
title: "Zevic を始めました"
alt: /en/blog/2026/10/29/project-start/
---
Zevic の開発を始めました。最初の日にあったのは、言語仕様の草案と実装計画、そして手で書いた LLVM IR だけです。

目標は、**C のコードをそのまま使える、小さくて書きやすいネイティブ言語**です。自前のバックエンドは持たず、ソースをテキストの LLVM IR に変換して clang に渡します。最初の日は、手書きの `hello.ll` が clang で動くこと、C のランタイム関数（`zevic_alloc` や `zevic_panic`）を IR から呼べることを確かめました。

その後の数日で、最初のコンパイラ zevic0（C 実装）が Hello World を、続いて FizzBuzz、階乗、素数を動かせるようになりました（v0.0.1 と v0.0.2）。
