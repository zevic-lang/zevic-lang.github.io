---
title: Your first Zevic program
permalink: /en/start/
alt: /start/
lead: A one-page tour of the basics, for people new to programming. Every piece of code here was compiled and run to check it.
---
<div class="toc" markdown="1">
1. [Setup](#s1)
2. [Hello, World](#s2)
3. [Variables and types](#s3)
4. [Functions and arrays](#s4)
5. [Handling failure: Option and Result](#s5)
6. [Passing functions around](#s6)
7. [Writing tests](#s7)
8. [Next steps](#s8)
</div>

## 1. Setup {#s1}

[Install Zevic](/en/install/) and check that `zevic --version` works. Programs go in files with the `.zev` extension. Any editor will do.

## 2. Hello, World {#s2}

Create `hello.zev`.

```zevic
module Main

import Zevic.Console

fn Main() {
    Console.Println("Hello, World!")
}
```

Compile and run it.

```sh
zevic hello.zev -o hello
./hello
```

```text
Hello, World!
```
{: .out}

- `module Main` says this file is the entry module of the program
- `import Zevic.Console` makes the standard library for console input and output available
- `fn Main()` is where the program starts running
- `Console.Println(...)` prints a string on one line

## 3. Variables and types {#s3}

Declare a variable with `let` (cannot be changed later) or `mut` (can be changed). **You always write the type and the initial value.**

```zevic
module Main

import Zevic.Console

fn Main() {
    let name: String = "Zevic"
    let year: I32 = 2026
    mut count: I32 = 0
    count += 1
    let pi: F64 = 3.14
    let ok: Bool = true
    Console.Println("${name} ${year} ${count} ${pi} ${ok}")
}
```

```text
Zevic 2026 1 3.14 true
```
{: .out}

- Inside a string, `${ ... }` takes an expression, and its value is placed into the string
- The main types: integers are `I8` `I16` `I32` `I64` (unsigned: `U8` ... `U64`), decimals are `F32` `F64`, and there are `Bool` `Char` `String`
- The contents of a `let` variable cannot be changed either (you cannot `Push` onto an array). Make it `mut` if you need to change it

## 4. Functions and arrays {#s4}

```zevic
module Main

import Zevic.Console

fn Square(n: I32) -> I32 {
    n * n
}

fn Sum(xs: Array<I32>) -> I32 {
    mut total: I32 = 0
    for (x in xs) {
        total += x
    }
    total
}

fn Main() {
    let nums: Array<I32> = [1, 2, 3, 4, 5]
    Console.Println("${Square(7)}")
    Console.Println("sum = ${Sum(nums)}")
    mut xs: Array<I64> = []
    for (i in 0..5) {
        xs.Push(i * i)
    }
    Console.Println("${xs.Len()} items, first ${xs[0]}, last ${xs[4]}")
}
```

```text
49
sum = 15
5 items, first 0, last 16
```
{: .out}

- A function is `fn name(param: Type) -> ReturnType { ... }`. **The value of the last expression** is the result (`return` can be left out)
- `0..5` is the range from 0 to 4, and `0..=5` includes 5
- The `i` in `for (i in 0..5)` is an `I64`. To put it into an `Array<I32>`, **convert the type explicitly**, as in `i.ToI32()`

## 5. Handling failure: Option and Result {#s5}

Zevic has no exceptions and no null. "There might be nothing" is an `Option`, and "this might fail" is a `Result`.

```zevic
module Main

import Zevic.Console

enum Shape {
    Circle(F64),
    Rect(F64, F64),

    fn Area() -> F64 {
        match (this) {
            Shape.Circle(r) => 3.14 * r * r,
            Shape.Rect(w, h) => w * h,
        }
    }
}

fn Half(n: I32) -> Result<I32, Error> {
    if (n % 2 != 0) {
        return Err(Error.New(ErrorKind.Invalid, "${n} is odd"))
    }
    Ok(n / 2)
}

fn Quarter(n: I32) -> Result<I32, Error> {
    let h: I32 = Half(n)?
    Half(h)
}

fn Main() {
    Console.Println("${Shape.Rect(2.0, 3.0).Area()}")
    match (Quarter(12)) {
        Ok(v) => Console.Println("ok ${v}"),
        Err(e) => Console.Println("error: ${e.Message()}"),
    }
    match (Quarter(6)) {
        Ok(v) => Console.Println("ok ${v}"),
        Err(e) => Console.Println("error: ${e.Message()}"),
    }
    let words: Array<String> = ["a", "bb"]
    match (words.Get(5)) {
        Some(w) => Console.Println(w),
        None => Console.Println("no such item"),
    }
}
```

```text
6.0
ok 3
error: 3 is odd
no such item
```
{: .out}

- An `enum` is a type that is one of several shapes. `match` handles each shape separately, and the compiler rejects a `match` that does not cover them all
- `expression?` takes `x` out of `Ok(x)`, and on `Err` returns from the function right there
- Reading outside an array with `xs[10]` is a bug, so it is a `Panic` (the program stops). When the index might be out of range, use `Get`, which gives an `Option`

## 6. Passing functions around {#s6}

```zevic
module Main

import Zevic.Console

fn Main() {
    let nums: Array<I32> = [1, 2, 3, 4, 5, 6]
    let double: fn(I32) -> I32 = (x: I32) => x * 2
    Console.Println("${double(21)}")
    mut total: I32 = 0
    nums.Each((x: I32) => { total += x })
    Console.Println("total ${total}")
    mut m: Map<String, I32> = Map.New()
    m.Set("a", 1)
    m.Set("b", 2)
    match (m.Get("b")) {
        Some(v) => Console.Println("b = ${v}"),
        None => Console.Println("none"),
    }
}
```

```text
42
total 21
b = 2
```
{: .out}

`(x: I32) => x * 2` is an anonymous function (a lambda). It can capture `mut` variables of the surrounding function, and changes are visible outside.

## 7. Writing tests {#s7}

A `test "name" { ... }` block is run by `zevpm test`.

```zevic
module Main

import Zevic.Console

fn Add(a: I32, b: I32) -> I32 { a + b }

test "Add adds" {
    if (Add(2, 3) != 5) { Panic("bad") }
}

fn Main() {
    Console.Println("${Add(2, 3)}")
}
```

Create a project with `zevpm`.

```sh
zevpm new myapp
cd myapp
zevpm run        # build and run
zevpm test       # run the tests
zevfmt -w .      # format the code
```

## 8. Next steps {#s8}

- `struct` / `class` / `interface`: [05_shapes in the examples](https://github.com/zevic-lang/zevic/blob/main/examples/05_shapes/src/Main.zev)
- Files, external programs, JSON and HTTP: [examples](https://github.com/zevic-lang/zevic/tree/main/examples)
- Working with C: [06_c_interop](https://github.com/zevic-lang/zevic/tree/main/examples/06_c_interop)
- [The language specification](https://github.com/zevic-lang/zevic/blob/main/docs/spec/zevic-spec.md)
- If you know other languages, see [From other languages](/en/from-other-languages/) too.
