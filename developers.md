---
title: 開発者
permalink: /developers/
lead: Zevic を作っている人たちです。
---
<ul class="rel">
{% for d in site.data.developers %}
<li class="dev">
  <img src="{{ d.avatar }}" alt="" width="72" height="72" loading="lazy">
  <div>
    <h3><a href="{{ d.url }}">{{ d.name }}</a></h3>
    <p class="muted">{{ d.role }}</p>
  </div>
</li>
{% endfor %}
</ul>

## 参加するには

Zevic はまだ小さなプロジェクトで、バグ報告、ドキュメントの修正、標準ライブラリやツールの改善、サンプルの追加、パッケージの公開など、どんな形の参加も歓迎します。

- 開発の進め方は [CONTRIBUTING.md](https://github.com/zevic-lang/zevic/blob/main/CONTRIBUTING.md)
- 言語の変更は[提案（proposals）](https://github.com/zevic-lang/zevic/tree/main/docs/proposals)として書きます
- 問題の報告は [GitHub Issues](https://github.com/zevic-lang/zevic/issues) へ
- コードは [Apache-2.0](https://github.com/zevic-lang/zevic/blob/main/LICENSE) で公開されます

組織は [zevic-lang](https://github.com/zevic-lang) です。

| リポジトリ | 内容 |
| --- | --- |
| [zevic](https://github.com/zevic-lang/zevic) | コンパイラ、zevpm、zevfmt、標準ライブラリ、言語仕様 |
| [examples](https://github.com/zevic-lang/examples) | 期待される出力つきのサンプル集 |
| [zevic-c](https://github.com/zevic-lang/zevic-c) | 最初の C 実装（アーカイブ） |
| [zevic-lang.github.io](https://github.com/zevic-lang/zevic-lang.github.io) | このサイト |
