---
title: Coming from other languages
permalink: /en/from-other-languages/
alt: /from-other-languages/
lead: Notes for people who have written C, C++, Rust, Go, Python or TypeScript, on the places where Zevic behaves differently. If you are new to programming, start with the [tutorial](/en/start/) instead.
---
## At a glance

| Topic | Zevic |
| --- | --- |
| Execution | Compiled to native code (LLVM IR, then clang) |
| Types | Static. **The type and an initial value are required** for every variable |
| Variables | `let` (immutable, contents cannot change) / `mut` (mutable) |
| Expressions | `if`, `match` and blocks return values. The last expression is the function's result |
| Failure | No exceptions. `Option` / `Result` and `?`. Bugs are a `Panic` |
| null | None (use `Option`) |
| Memory | Garbage collected (the Boehm GC is bundled) |
| Defining types | `struct` (value type) / `class` (reference type) / `enum` (can carry data) / `interface` |
| Inheritance | None. Implement an `interface`, with default methods |
| Generics | Yes. One function is generated per type (monomorphisation) |
| Concurrency | `async` / `await`, `Async.Channel`, OS threads (`Thread.Spawn`) |
| C interop | `extern "C"` / `export "C"`. C sources build together |
| Numeric conversion | No implicit conversions (write `.ToI32()` and so on) |
| Overflow and division by zero | `Panic` |

## What the syntax looks like

```zevic
module Main

import Zevic.Console

struct Point {
    mut X: I32
    mut Y: I32
    fn Init(x: I32, y: I32) { this.X = x; this.Y = y }
    fn Dist2() -> I32 { this.X * this.X + this.Y * this.Y }
}

fn Main() {
    let p: Point = Point.New(3, 4)
    Console.Println("${p.Dist2()}")
}
```

- Conditions are wrapped in parentheses: `if (x > 0) { ... }`, `while (...)`, `for (x in xs)`, `match (v) { ... }`
- Values are made with `Point.New(...)`. The compiler generates `New` from `Init` (defining it yourself is an error)
- String interpolation is `"${expr}"`
- Module functions are called with the module name, as in `Console.Println`

## Notes by language

### From C / C++

- No headers are needed. Declare a C function as `extern "C" { fn puts(s: CString) -> CInt }` and call it. Only C types are allowed in parameters and results, and you convert with `"hello".ToC()` or `String.FromC(p)`
- C sources can be compiled together, as in `zevic main.zev native.c -o app`
- In the other direction, expose a Zevic function with `export "C" fn ...` and call it from C. `--emit-header` also writes a C header
- The GC manages memory, so there is no `free` to call (for memory allocated on the C side, see "The boundary with the GC" in the specification)

```zevic
module Main

import Zevic.Console

extern "C" {
    fn call_twice(x: CInt) -> CInt
}

export "C" fn zv_double(x: CInt) -> CInt {
    (x.ToI32() * 2).ToCInt()
}

fn Main() {
    Console.Println("${call_twice(21.ToCInt()).ToI32()}")
}
```

```c
/* native.c */
extern int zv_double(int);
int call_twice(int x) { return zv_double(x); }
```

```sh
zevic main.zev native.c -o app && ./app
```

```text
42
```
{: .out}

### From Rust

- `match`, `enum` (with data), `Option` / `Result` and `?` feel the same. The difference is that `?` works only in a function that returns `Result<_, Error>`, and the error type is fixed to `Error`
- There is no borrow checker and there are no lifetimes. There is a GC
- A `struct` is a value type and is copied; a `class` is a reference type
- What a `trait` does is done by an `interface`. There are no `impl` blocks: methods are written inside the type

### From Go

- The GC, `defer` and `interface` will be familiar. An `interface` implementation is stated in the type's declaration, as in `: Shape`
- Instead of a `(value, err)` pair you return `Result<T, Error>` and propagate with `?`
- In place of goroutines there are `async { ... }` with `await`, `Async.Channel<T>` and `Thread.Spawn`

### From Python / JavaScript / TypeScript

- It is statically typed and compiled. Type annotations cannot be omitted
- Instead of `None` / `undefined` you get an `Option<T>` and take it apart with `match`
- There are no exceptions. A missing file or a string that is not a number comes back as a `Result`
- Integer types have fixed widths such as `I32` and `I64`, and you convert explicitly, as in `.ToI64()`, when mixing them

## Things that trip people up

- The `i` in `for (i in 0..5)` is an `I64`. To put it into an `Array<I32>`, convert it with `i.ToI32()`
- You cannot `Push` / `Set` on a `let` array or Map. Make it `mut` to change it
- Reading outside an array (`xs[10]`) is a Panic. Use `xs.Get(10)` (an `Option`) to read safely
- It is `Main`, not `main`, and function names conventionally start with a capital letter
- The default optimisation level is `-O0`. When measuring speed, use `zevic -O2` or `zevpm build --release`
