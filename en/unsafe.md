---
title: Manual memory and unsafe
permalink: /en/unsafe/
alt: /unsafe/
lead: Zevic's memory is normally managed by the GC. This is for the times you want to allocate and give back memory yourself, outside it. Every piece of code here was compiled and run to check it.
---
> This feature is in the development version (main) and is not in 0.4.8. It will be available from the next release.

<div class="toc" markdown="1">
1. [When to use it](#u1)
2. [A first example](#u2)
3. [The operations](#u3)
4. [Types that fit, types that don't](#u4)
5. [What you have to take care of](#u5)
6. [unsafe fn](#u6)
7. [Wrap it in a safe container](#u7)
</div>

## 1. When to use it {#u1}

Most programs do fine with the GC handling `String`, arrays and classes. `unsafe` helps when you want to:

- keep a big table of plain numbers that the GC does not scan, and decide yourself when it is allocated and freed
- work with a buffer shared with C
- build a structure whose lifetime you manage, like an arena or a pool

Ordinary programs do not need it. **If in doubt, don't use it.**

## 2. A first example {#u2}

Manual memory can be used only inside an `unsafe { ... }` block.

```zevic
module Main

import Zevic.Console
import Zevic.Unsafe

fn Main() {
    unsafe {
        let p: *I64 = Unsafe.Alloc<I64>(3)   // room for 3 I64, filled with 0
        p.Write(0, 10)
        p.Write(1, 20)
        p.Offset(2).Write(0, 30)             // Offset(2) is 2 values further
        Console.Println("${p.Read(0)} ${p.Read(1)} ${p.Read(2)}")
        Unsafe.Free(p)                       // give it back when done
    }
}
```

```text
10 20 30
```
{: .out}

- `Unsafe.Alloc<I64>(3)` allocates room for three I64 and returns a pointer (`*I64`). The memory is filled with 0
- `p.Write(i, v)` writes the i-th value and `p.Read(i)` reads it. Numbers count **values, not bytes**
- `p.Offset(n)` is the pointer n values further
- Give memory back with `Unsafe.Free(p)`. If you don't, it stays until the program ends (the GC does not collect it)
- `Unsafe.Alloc` needs `import Zevic.Unsafe`

`unsafe { ... }` is an ordinary block, so its last expression is its value: `let n: I64 = unsafe { p.Read(0) }`.

## 3. The operations {#u3}

| Syntax | Meaning |
| --- | --- |
| `Unsafe.Alloc<T>(n)` | room for n values of T (zero-filled); a null pointer if there is no memory |
| `Unsafe.Free(p)` | give it back; only for what `Alloc` returned |
| `Unsafe.Cast<U>(p)` | the same address, seen as a pointer to another type `U` |
| `p.Read(i)` / `p.Write(i, v)` | read or write the i-th value |
| `p.Offset(n)` | the pointer n values further |
| `p.IsNull()` | is it null? **The only one that works outside `unsafe`** |

The pointer is the same `*T` as in the C interop. `Read`, `Write` and `Offset` work on a `*T` that came from C too.

## 4. Types that fit, types that don't {#u4}

Manual memory **cannot hold references managed by the GC**. The GC does not scan this memory, so a `String` or a class reference kept there could be collected while you still use it. The compiler stops this when you allocate, read or write.

What fits: numbers, `Bool`, `Char`, pointers, and structs, tuples and enums made only of those.

```zevic
let p: *String = Unsafe.Alloc<String>(1)
```

```text
error: `String` holds a reference managed by the garbage collector, so it cannot be kept in manual memory (only numbers, `Bool`, `Char`, pointers, and structs, tuples and enums made of them)
```
{: .out}

What doesn't: `String`, classes, `Array`, functions, interfaces. `Unit` and `CVoid` have no size, so they don't either. If you get a `*CVoid`, turn it into a pointer to a sized type with `Unsafe.Cast` before reading or writing.

Using these outside `unsafe` is also a compile error:

```text
error: `Unsafe.Alloc` can only be used inside an `unsafe { ... }` block
```
{: .out}

## 5. What you have to take care of {#u5}

Inside `unsafe`, some things the compiler does not check. **Checking them is your job.**

- **Range:** `Read` or `Write` with an index past what you allocated just runs, and reads or damages other memory
- **Use after free:** never read or write a pointer after `Free`
- **Double free:** never `Free` the same pointer twice (`Free` of a null pointer does nothing)
- **Forgetting to free:** without `Free`, the memory stays until the program ends

A mistake here may give no error at all. The program may print strange values or stop. So keep the code that touches manual memory as small as you can.

## 6. unsafe fn {#u6}

A function that needs care can be an `unsafe fn`. Its whole body counts as `unsafe`, and it **can be called only from `unsafe` code**.

```zevic
unsafe fn Total(p: *I64, n: I64) -> I64 {
    mut s: I64 = 0
    mut i: I64 = 0
    while (i < n) {
        s += p.Read(i)
        i += 1
    }
    s
}

fn Main() {
    let p: *I64 = unsafe { Unsafe.Alloc<I64>(3) }
    let t: I64 = unsafe { Total(p, 3) }
}
```

- It works on ordinary functions and on methods (`static unsafe fn` and `mut unsafe fn` too)
- Inside an `unsafe fn` you can call another `unsafe fn` without an `unsafe { }`
- Calling it from outside `unsafe` is a compile error:

```text
error: `Danger` is an `unsafe fn`, so it can only be called inside an `unsafe { ... }` block or another `unsafe fn`
```
{: .out}

- A lambda written inside `unsafe { }` is not `unsafe`. To call an `unsafe fn` in the lambda, it needs its own `unsafe { }`
- An `unsafe fn` cannot be passed as a value (`let f = Total` is an error), because that would skip the check at the call
- A method of an interface cannot be `unsafe`

## 7. Wrap it in a safe container {#u7}

The most important habit with `unsafe`: **wrap it in a container that checks the range, and show only safe functions to the outside.** The dangerous part sits in one place, so it is easy to review.

```zevic
module Main

import Zevic.Console
import Zevic.Unsafe

// A safe container that checks the range. `unsafe` stays inside
struct IntBuffer {
    P: *I64
    Len: I64

    fn Init(len: I64) {
        this.P = unsafe { Unsafe.Alloc<I64>(len) }
        this.Len = len
    }

    fn Get(i: I64) -> Option<I64> {
        if (i < 0 || i >= this.Len) {
            return None
        }
        Some(unsafe { this.P.Read(i) })
    }

    fn Set(i: I64, v: I64) -> Bool {
        if (i < 0 || i >= this.Len) {
            return false
        }
        unsafe { this.P.Write(i, v) }
        true
    }

    fn Free() {
        unsafe { Unsafe.Free(this.P) }
    }
}

fn Main() {
    let b: IntBuffer = IntBuffer.New(3)
    b.Set(0, 100)
    b.Set(2, 300)
    Console.Println("${b.Set(3, 999)}")
    Console.Println("${b.Get(0).Unwrap()} ${b.Get(1).Unwrap()} ${b.Get(2).Unwrap()}")
    Console.Println("${b.Get(3).IsNone()}")
    b.Free()
}
```

```text
false
100 0 300
true
```
{: .out}

- `Get` and `Set` check the range themselves, then read or write inside `unsafe`. Out of range gives `None` or `false`, so the caller needs no `unsafe`
- Freshly allocated memory is filled with 0, so index 1, which was never written, is 0
- The caller has to remember to call `Free`

For the full rules, see "Manual memory" in the [specification](https://github.com/zevic-lang/zevic/blob/main/docs/spec/zevic-spec.md) and [proposal 0011](https://github.com/zevic-lang/zevic/blob/main/docs/proposals/0011-unsafe.md).
