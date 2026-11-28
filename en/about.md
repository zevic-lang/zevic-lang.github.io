---
title: About
permalink: /en/about/
alt: /about/
lead: Zevic is a small, easy-to-write native language that uses C code as it is.
---
## Design principles

Zevic turns source code into **textual LLVM IR** and leaves the machine code to `clang`. It has no back end of its own, which keeps the language and the compiler small.

- **Easy to write**: types and initial values are always written, and there are no variables without a value. `if` and `match` are expressions that return values
- **Safe defaults**: variables are `let` (immutable) unless you need `mut`. There is no null and there are no exceptions
- **A clear boundary with C**: C types (`CInt`, `CString` and so on) are converted explicitly. There are no implicit conversions
- **Garbage collected**: the Boehm GC is bundled. How memory is handled at the boundary with C is described in the language specification

## No border with C

What Zevic aims for is **no border with C**. C libraries have done more of the world's work than any others. For a language to be used, those libraries must be usable as they are.

- Write `import C "sqlite3.h" as Sq`, and clang reads the header: the functions, structs and constants are there to use. No C code at all ([Using C](/en/c/))
- Functions that pass structs by value work too. The compiler writes the C shim they need
- To edit the header's module by hand, `zevic bind` writes it to a file
- In the other direction, `export "C"` lets C call Zevic functions
- `--freestanding`, with no runtime and no GC, can write the kernel of an OS ([Writing an OS](/en/os/))

## How it works
```text
.zev source
  → zevic (lexing, parsing, type checking)
  → LLVM IR (text)
  → clang ← runtime, Boehm GC, your C sources
  → executable
```

`zevic` looks for clang in this order: `--cc`, the `ZEVIC_CLANG` environment variable, `clang` on `PATH`, and then the usual install locations such as Homebrew and `/usr/lib/llvm-*/bin`. clang 15 or newer is required.

## Self-hosting

The compiler (`tools/zevic1/`, about 13,000 lines of Zevic) is written in Zevic itself. The LLVM IR that `zevic1` produces when it builds itself is byte-for-byte the same from one generation to the next. That IR is committed as `bootstrap/zevic.ll`, so you can build the compiler from scratch with **clang alone**.

The first implementation was written in C ([zevic-c](https://github.com/zevic-lang/zevic-c), now archived).

## Tools

| Tool | Purpose |
| --- | --- |
| `zevic` | The compiler: `zevic hello.zev -o hello` |
| `zevpm` | Packages, builds and tests: `zevpm new`, `run`, `test`, `get`, `build --release` |
| `zevic bind` | Writes a Zevic module from a C header: `zevic bind sqlite3.h -o src/Sqlite3.zev` |
| `zevfmt` | Formatter: `zevfmt -w .` rewrites files, `zevfmt -check .` verifies them |

## Standard library

The standard library is the `Zevic` package. Its modules are:

`Async` `BigInt` `Bytes` `Chars` `Cli` `Console` `Convert` `Csv` `DateTime` `Deflate` `Digest` `Encoding` `Env` `Fs` `Gzip` `Json` `Log` `Math` `Net` `Path` `Process` `Random` `Regex` `Tar` `Test` `Text` `Thread` `Time` `Toml` `Zip` `Zlib`

HTTP left the standard library in 0.6.0 and is now in packages. The client is the [curl package](https://github.com/zevic-lang/curl) (`zevpm get zevic-lang/curl`; HTTPS, redirects and proxies), built on libcurl, and the server is the [httpd package](https://github.com/zevic-lang/httpd). The [sqlite package](https://github.com/zevic-lang/sqlite) is written with `import C` and no C code.

## Status

Version {{ site.version }}. Types, `struct` / `class` / `enum`, union types, `interface`, generics, closures, `defer`, the GC, C interop (`import C`, `zevic bind`), `--freestanding`, `test` blocks, `async` / `await`, `zevpm` and the standard library all work. The language is still in development, so the specification will keep changing. See the [releases](/en/releases/) and the [language specification](https://github.com/zevic-lang/zevic/blob/main/docs/spec/zevic-spec.md).

The specification itself is written in English.

## License

Apache License 2.0.
