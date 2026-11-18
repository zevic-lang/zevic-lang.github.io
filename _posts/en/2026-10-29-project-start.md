---
title: "We have started Zevic"
alt: /blog/2026/10/29/project-start/
---
We have started work on Zevic. On the first day there was only a draft of the language specification, an implementation plan, and some hand-written LLVM IR.

The goal is **a small, easy-to-write native language that uses C code as it is**. It has no back end of its own: the compiler turns source code into textual LLVM IR and hands it to clang. On the first day we checked that a hand-written `hello.ll` runs under clang, and that C runtime functions (`zevic_alloc`, `zevic_panic`) can be called from IR.

Over the next few days the first compiler, zevic0 (written in C), learned to run Hello World, then FizzBuzz, factorial and primes (v0.0.1 and v0.0.2).
