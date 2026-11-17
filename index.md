---
layout: home
title: Zevic
description: Zevic は、C のコードをそのまま使える、小さくて書きやすいネイティブ言語です。
---
<section class="hero">
  <div class="wrap">
    <div>
      <h1>小さく書いて、<br><em>ネイティブ</em>で走る。</h1>
      <p class="lead">Zevic は、C のコードをそのまま使える、小さくて書きやすいネイティブ言語です。ソースを LLVM IR に変換し、clang で機械語にします。コンパイラは Zevic 自身で書かれています。</p>
      <div class="btns">
        <a class="btn primary" href="/start/">はじめてみる</a>
        <a class="btn" href="/install/">インストール</a>
        <a class="btn" href="/about/">Zevic とは</a>
      </div>
    </div>
    <img class="logo" src="/assets/img/logo.png" alt="Zevic のロゴ: Z の文字を金色と青の二匹の龍が囲んでいる" width="360" height="360">
  </div>
</section>

<section class="block">
  <div class="wrap two">
    <div markdown="1">
      <h2>こんな言語です</h2>
      <p class="sub">最新リリース: <a href="/releases/">v{{ site.version }}</a></p>
```zevic
module Main

import Zevic.Console

fn FizzBuzz(n: I32) -> String {
    if (n % 15 == 0) {
        "FizzBuzz"
    } else if (n % 3 == 0) {
        "Fizz"
    } else if (n % 5 == 0) {
        "Buzz"
    } else {
        "${n}"
    }
}

fn Main() {
    for (i in 1..=20) {
        Console.Println(FizzBuzz(i))
    }
}
```
    </div>
    <div markdown="1">
      <h2>動かす</h2>
      <p class="sub">clang（15 以上）があれば、これだけです。</p>

```sh
zevic fizzbuzz.zev -o fizzbuzz
./fizzbuzz
```

      <p>型は必ず書き、<code>if</code> や <code>match</code> は値を返す式です。例外は無く、失敗は <code>Result</code> で、バグは <code>Panic</code> で扱います。</p>
    </div>
  </div>
</section>

<section class="block">
  <div class="wrap">
    <h2>特長</h2>
    <p class="sub">小さな言語に、必要なものを揃えました。</p>
    <div class="grid">
      <div class="card"><h3>C をそのまま使える</h3><p><code>extern "C"</code> で C の関数を呼び、<code>export "C"</code> で Zevic の関数を C から呼べます。C のソースは一緒にビルドできます。</p></div>
      <div class="card"><h3>セルフホスト</h3><p>コンパイラ <code>zevic1</code> は Zevic で書かれ、自分自身を同じ LLVM IR にビルドできます（<code>make bootstrap</code>）。</p></div>
      <div class="card"><h3>失敗を型で表す</h3><p><code>Option</code> と <code>Result</code>、<code>?</code> 演算子。例外はなく、null もありません。</p></div>
      <div class="card"><h3>型の表現力</h3><p><code>struct</code> / <code>class</code> / <code>enum</code> / <code>interface</code>、ジェネリクス、クロージャ、共用体型 <code>A | B</code>。</p></div>
      <div class="card"><h3>並行処理</h3><p><code>async</code> / <code>await</code>、チャネル、OS スレッド（<code>Thread.Spawn</code>）、多倍長整数 <code>BigInt</code>。</p></div>
      <div class="card"><h3>広い標準ライブラリ</h3><p><code>Fs</code> <code>Json</code> <code>Http</code> <code>Net</code> <code>Regex</code> <code>Csv</code> <code>Toml</code> <code>DateTime</code> <code>Zip</code> <code>Cli</code> など。</p></div>
      <div class="card"><h3>道具が揃っている</h3><p>パッケージ・ビルドの <code>zevpm</code>、整形の <code>zevfmt</code>、<code>test</code> ブロックによるテスト。</p></div>
      <div class="card"><h3>GC 付き</h3><p>Boehm GC を同梱。メモリ管理を意識せずに書けます。</p></div>
    </div>
  </div>
</section>

<section class="block">
  <div class="wrap">
    <h2>最新のお知らせ</h2>
    <ul class="rel">
    {% for post in site.posts limit:3 %}
      <li>
        <h3><a href="{{ post.url }}">{{ post.title }}</a></h3>
        <span class="muted">{{ post.date | date: "%Y年%-m月%-d日" }}</span>
      </li>
    {% endfor %}
    </ul>
    <p><a href="/blog/">ブログをすべて見る →</a></p>
  </div>
</section>
