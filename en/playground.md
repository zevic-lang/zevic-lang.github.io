---
title: Playground
permalink: /en/playground/
layout: playground
lead: Write Zevic code and run it right in your browser. Nothing is sent to a server.
alt: /playground/
l_examples: Example
l_run: Run
l_share: Share link
l_loading: Loading…
l_source: Code
l_output: Output
---
The code is compiled and run inside your browser. "Share link" puts the code after the `#` of the URL, so nothing is stored on a server.

What runs here is the real `zevic` compiler (built for WebAssembly) and its standard library. Compiling takes a few tens of milliseconds.

Limits:

- No files, processes, networking or standard input.
- There are no threads, so an `async` task runs to the end as soon as it is started. A program whose tasks wait for each other (a channel receive, for example) stops.
- Running is slower than native, and a program that recurses too deeply (more than a few thousand levels) stops with "stack overflow".
- Memory is never freed (there is no GC), so a program that keeps allocating can run out of memory and stop.
- No C interop (`extern "C"`).
