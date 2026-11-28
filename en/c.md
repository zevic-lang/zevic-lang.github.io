---
title: Using C
permalink: /en/c/
alt: /c/
lead: Zevic aims for "no border with C". Read a C header, and its functions, structs and constants are there to use from Zevic. You can call libraries such as sqlite and zlib without writing a line of C. Every piece of code here was compiled and run to check it.
---
> This feature is available from 0.6.0. `import C` and `zevic bind` need clang (the same one Zevic uses to build).

<div class="toc" markdown="1">
1. [The idea](#c1)
2. [import C: read a header](#c2)
3. [How types map](#c3)
4. [Structs by value](#c4)
5. [Callbacks](#c5)
6. [zevic bind: write it to a file](#c6)
7. [What cannot be bound](#c7)
8. [Writing an OS](#c8)
</div>

## 1. The idea {#c1}

Zevic could always call a C function if you declared it with `extern "C"`. But you had to write each declaration by hand, and for a function that takes a struct by value, or for a macro, you needed a thin bridge written in C (a shim).

0.6.0 removes that work.

- `import C "header" as Name` has clang read the header while compiling, and makes the module for you
- the C shims that structs by value need are written by the compiler and compiled with your program
- numbers and strings from `#define`, and `enum` values, become `let` constants

The goal is that a package that wraps a library has **0 lines of C**. The [sqlite package](https://github.com/zevic-lang/sqlite) did it: its 64 lines of C shim are gone, and `import C "sqlite3.h"` is all it needs.

## 2. import C: read a header {#c2}

```zevic
module Main

import C "sqlite3.h" as Sq strip "sqlite3_", "SQLITE_"
import Zevic.Console

fn Main() {
    let v: CString = Sq.Libversion()
    Console.Println("SQLite ${String.FromC(v)}")
    Console.Println("${Sq.SqliteOk} ${Sq.Row} ${Sq.Done}")
}
```

```sh
zevic main.zev -lsqlite3 -o main
./main
```

```text
SQLite 3.45.1
0 100 101
```

- `import C "sqlite3.h" as Sq` makes the module `Sq`. The header is looked for next to the file, in the current directory, and in the directories given with `-I`, in this order
- `strip "sqlite3_", "SQLITE_"` lists prefixes to take off the names: `sqlite3_libversion` is `Sq.Libversion` and `SQLITE_ROW` is `Sq.Row` (the case does not matter)
- A name that would clash with a standard name keeps its prefix: `SQLITE_OK` is `SqliteOk`, not `Ok`
- Only what the header declares itself is bound, not what it `#include`s

In a `zevpm` package, put `libs = ["sqlite3"]` or `include_dirs` in `[native]` of `zevic.toml`.

## 3. How types map {#c3}

| C | Zevic |
| --- | --- |
| `int`, `long`, `unsigned char` and so on | `CInt`, `CLong`, `CUChar` and so on |
| `size_t` | `CSizeT` |
| `const char *` | `CString` |
| `int *`, `struct S *` | `*CInt`, `*S` |
| a pointer to something opaque (`sqlite3 *`) | `*CVoid` |
| a function pointer | `fn(...) -> ...` |
| `enum` | `CInt` (the values are `let` constants) |
| `struct` | `struct` (the fields are in C's order) |

As before, you convert between C types and Zevic types by hand (`.ToI32()`, `.ToCInt()`). There are no implicit conversions.

## 4. Structs by value {#c4}

Many C libraries, raylib among them, pass `Vector2` and `Color` by value and return them by value. The calling convention differs from one system to the next, and it is easy to get wrong by hand.

Zevic **leaves it to the C compiler**. Take this C header:

```c
typedef struct { float x, y; } Vector2;
typedef struct { unsigned char r, g, b, a; } Color;
Vector2 Vector2Add(Vector2 a, Vector2 b);
void ClearBackground(Color c);
```

`import C` writes and compiles a C function like this one behind the scenes:

```c
void zevic_shim_Vector2Add(Vector2 *a, Vector2 *b, Vector2 *out) { *out = Vector2Add(*a, *b); }
```

To you, it looks like an ordinary function that takes and returns values.

```zevic
import C "mini.h" as Rl

fn Main() {
    let a: Rl.Vector2 = Rl.Vector2.New(1.0.ToCFloat(), 2.0.ToCFloat())
    let s: Rl.Vector2 = Rl.Vector2Add(a, a)
    Rl.ClearBackground(Rl.Color.New(255.ToCUChar(), 0.ToCUChar(), 0.ToCUChar(), 255.ToCUChar()))
}
```

The shim file is not left in your working directory (it is written to a temporary directory).

## 5. Callbacks {#c5}

For a function-pointer parameter, pass a Zevic function as it is. To pass nothing (C's `NULL`), pass `Null`.

```zevic
fn twice(i: CInt) -> CInt {
    (i.ToI32() * 2).ToCInt()
}

fn Main() {
    Lib.Run(Null)       // C gets NULL
    Lib.Run(twice)
}
```

Some C APIs give a function pointer a meaning by **putting a number in it**: sqlite's `SQLITE_TRANSIENT` (`-1`) and the signal handler `SIG_IGN`. For these there is `Unsafe.CallbackAt`.

```zevic
import Zevic.Unsafe

// only to pass to C; never call it from Zevic
let Transient: fn(*CVoid) -> CVoid = Unsafe.CallbackAt<fn(*CVoid) -> CVoid>(-1)
```

## 6. zevic bind: write it to a file {#c6}

`import C` reads the header every time you compile. When you want to **see the generated module, or edit it by hand**, `zevic bind` writes it to a file.

```sh
zevic bind sqlite3.h --module Sqlite3 --strip-prefix sqlite3_ --strip-prefix SQLITE_ -o src/Sqlite3.zev
```

The output is plain text: an `extern "C" { ... }` block, then `struct`s and `let` constants. For a header with structs by value, `--shims shim.c` says where the shims go (compile `shim.c` with the program). `-I` and `-D` go to clang as they are.

## 7. What cannot be bound {#c7}

What cannot be bound is listed, with the reason, at the end of the output of `zevic bind`. With `import C` the function is simply not there.

- variadic functions (such as `printf`). Declare a small function that takes only fixed arguments with `extern "C"` yourself
- a function that takes a callback and a struct by value together
- unions, bit fields and `long double`
- macros that are not a plain number or string

## 8. Writing an OS {#c8}

It is not only libraries that work on C's level. Compiled with no runtime and no GC, Zevic can write the kernel of an OS, or firmware. See [Writing an OS](/en/os/).
