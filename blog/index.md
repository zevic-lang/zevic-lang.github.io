---
title: ブログ
permalink: /blog/
lead: リリースのお知らせや、設計についての記事を載せます。
---
<ul class="rel">
{% for post in site.posts %}
<li>
  <h2><a href="{{ post.url }}">{{ post.title }}</a></h2>
  <p class="muted">{{ post.date | date: "%Y年%-m月%-d日" }}</p>
  {% if post.excerpt %}<p>{{ post.excerpt | strip_html | truncate: 120 }}</p>{% endif %}
</li>
{% endfor %}
</ul>
<p><a href="/feed.xml">Atom フィード</a></p>
