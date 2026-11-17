---
layout: home
title: Zevic
description: Zevic は、C のコードをそのまま使える、小さくて書きやすいネイティブ言語です。
---
<section class="hero">
  <div class="wrap">
    <div>
      <p class="ver">v{{ site.version }}</p>
      <h1>C のコードをそのまま使える、<br>小さなネイティブ言語。</h1>
      <p class="lead">Zevic は、ソースを LLVM IR に変換し、clang で機械語にします。型は必ず書き、失敗は <code>Result</code> で返し、メモリは GC が管理します。コンパイラは Zevic 自身で書かれています。</p>
      <div class="btns">
        <a class="btn primary" href="/start/">はじめてみる</a>
        <a class="btn" href="/install/">インストール</a>
        <a class="btn" href="/about/">Zevic とは</a>
      </div>
    </div>
    <img class="logo" src="/assets/img/logo.png" alt="Zevic のロゴ: Z の文字を金色と青の二匹の龍が囲んでいる" width="240" height="240">
  </div>
</section>

<section class="block">
  <div class="wrap example">
    <div markdown="1">

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
    <div>
      <h2>コンパイルして実行</h2>
      <div class="highlighter-rouge language-sh"><div class="highlight"><pre class="highlight"><code>zevic fizzbuzz.zev -o fizzbuzz
./fizzbuzz</code></pre></div></div>
      <p><code>if</code> や <code>match</code> は値を返す式で、最後の式が関数の戻り値です。例外も null もありません。続きは<a href="/start/">はじめての Zevic</a>で。</p>
    </div>
  </div>
</section>

<section class="block">
  <div class="wrap">
    <h2>特長</h2>
    <ul class="facts">
      <li><b>C をそのまま使える</b><span><code>extern "C"</code> で C の関数を呼び、<code>export "C"</code> で Zevic の関数を C から呼べます。C のソースは一緒にビルドできます。</span></li>
      <li><b>セルフホスト</b><span>コンパイラ <code>zevic1</code> は Zevic で書かれ、自分自身を同じ LLVM IR にビルドできます（<code>make bootstrap</code>）。</span></li>
      <li><b>失敗を型で表す</b><span><code>Option</code> と <code>Result</code>、<code>?</code> 演算子。例外はなく、null もありません。</span></li>
      <li><b>型の表現力</b><span><code>struct</code> / <code>class</code> / <code>enum</code> / <code>interface</code>、ジェネリクス、クロージャ、共用体型 <code>A | B</code>。</span></li>
      <li><b>並行処理</b><span><code>async</code> / <code>await</code>、チャネル、OS スレッド（<code>Thread.Spawn</code>）、多倍長整数 <code>BigInt</code>。</span></li>
      <li><b>標準ライブラリ</b><span><code>Fs</code> <code>Json</code> <code>Http</code> <code>Net</code> <code>Regex</code> <code>Csv</code> <code>Toml</code> <code>DateTime</code> <code>Zip</code> <code>Cli</code> など 30 以上のモジュール。</span></li>
      <li><b>道具</b><span>パッケージ・ビルドの <code>zevpm</code>、整形の <code>zevfmt</code>、<code>test</code> ブロックによるテスト。</span></li>
      <li><b>GC 付き</b><span>Boehm GC を同梱。メモリ管理を意識せずに書けます。</span></li>
    </ul>
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
