---
title: リリース・開発状況
permalink: /releases/
lead: 各バージョンの変更点と、開発の現在地です。ダウンロードは GitHub Releases にあります。
---
<div class="note" markdown="1">
Zevic は開発中の言語です。0.x の間は、言語仕様や標準ライブラリの API が変わることがあります。変更点は各リリースの記録と [CHANGELOG](https://github.com/zevic-lang/zevic/blob/main/CHANGELOG.md) にあります。
</div>

## 開発状況

| 領域 | 状況 |
| --- | --- |
| コンパイラ | セルフホスト済み（`zevic1`）。C 実装は[アーカイブ](https://github.com/zevic-lang/zevic-c)済み |
| 言語機能 | 型、`struct` / `class` / `enum` / `interface`、ジェネリクス、クロージャ、共用体型、`defer`、`async` / `await`、`test` ブロック |
| C 連携 | `extern "C"` / `export "C"`、ヘッダーの生成、C / C++ のソースの同時ビルド |
| 標準ライブラリ | 30 以上のモジュール。HTTP は TLS 未対応 |
| ツール | `zevpm`（パッケージ・ビルド・テスト）、`zevfmt`（整形） |
| 対応 OS | Linux（x64）、macOS（arm64）、Windows（x64）。Termux はソースからビルド |
| 既知の制限 | DateTime のタイムゾーンは固定オフセットのみ。TOML の日時はテキストのまま。正規表現のフラグはパターン全体に効く |

ロードマップは [docs/plan.md](https://github.com/zevic-lang/zevic/blob/main/docs/plan.md)、設計の提案は [docs/proposals](https://github.com/zevic-lang/zevic/tree/main/docs/proposals) にあります。

## リリース一覧

<ul class="rel">
{% for r in site.data.releases %}
<li id="v{{ r.version }}">
  <h3>v{{ r.version }}{% if forloop.first %}<span class="tag">最新</span>{% endif %}</h3>
  <p class="muted">{% if r.date != "" %}{{ r.date | date: "%Y年%-m月%-d日" }} ・ {% endif %}{{ r.summary }}</p>
  <ul>
  {% for c in r.changes %}<li>{{ c }}</li>
  {% endfor %}
  </ul>
  {% if r.date != "" %}<ul class="dl">
    <li><a href="https://github.com/zevic-lang/zevic/releases/tag/v{{ r.version }}">リリースノートとダウンロード</a></li>
  </ul>{% endif %}
</li>
{% endfor %}
</ul>

## 各リリースに含まれるファイル

| ファイル | 用途 |
| --- | --- |
| `zevic-<版>-linux-x64.tar.gz` | Linux（x64） |
| `zevic_<版>_amd64.deb` | Debian / Ubuntu（amd64） |
| `zevic-<版>-macos-arm64.pkg` / `.tar.gz` | macOS（Apple Silicon） |
| `zevic-<版>-windows-x64-setup.exe` / `.zip` | Windows（x64） |
| `install.sh` / `install.ps1` | 展開済みのアーカイブ向けインストーラー |
| `SHA256SUMS.txt` | チェックサム |
