---
title: Writing an OS
permalink: /en/os/
alt: /os/
lead: Zevic can compile with no runtime and no GC. This mode is for code that runs where there is nothing underneath, such as the kernel of an OS or firmware.
---
> This feature is available from 0.6.0. The example here is `examples/hello-os` in the [repository](https://github.com/zevic-lang/zevic/tree/main/examples/hello-os), where a RISC-V kernel is built to check it.

<div class="toc" markdown="1">
1. [What freestanding is](#o1)
2. [A kernel that prints Hello, World!](#o2)
3. [What you can and cannot write](#o3)
4. [Reading and writing registers](#o4)
5. [In zevic.toml](#o5)
6. [When something fails: zevic_panic](#o6)
</div>

## 1. What freestanding is {#o1}

An ordinary Zevic program is linked with the runtime, the GC (Boehm) and the C standard library. When you write an OS, none of them is there. With `--freestanding`:

- the runtime, the GC and the standard library are not linked
- code is made for a place with no execution environment (no red zone; RISC-V gets `-mcmodel=medany`)
- `.S` (assembly) and `.c` files can be inputs too. The startup code is written in assembly

It is the same set of tools as writing an OS in C; only the language is Zevic.

## 2. A kernel that prints Hello, World! {#o2}

A kernel that only writes characters to the UART (serial port) of QEMU's RISC-V `virt` machine.

```zevic
module Kernel

import Zevic.Unsafe

// The UART of QEMU's virt machine. A volatile write is a store the compiler must keep
let UartBase: U64 = 0x10000000

fn putc(c: U8) {
    unsafe {
        Unsafe.At<U8>(UartBase).WriteVolatile(0, c)
    }
}

// A string literal lives in the image, so it needs no heap
fn print(s: String) {
    mut i: I64 = 0
    while (i < s.Len()) {
        putc(s.ByteAt(i))
        i += 1
    }
}

export "C" fn zevic_panic(msg: *U8, len: CLongLong, file: *U8, line: CInt) {
    print("panic\n")
    while (true) {}
}

// Called from native/boot.S once the stack is set
export "C" fn kmain() {
    print("Hello, World!\n")
}
```

The first code that runs (`native/boot.S`) only sets the stack and calls `kmain`.

```asm
.section .text.boot
.global _start
_start:
    la sp, stack_top
    call kmain
1:  wfi
    j 1b

.section .bss
.balign 16
stack_bottom:
    .skip 16384
.global stack_top
stack_top:
```

Build and run (you need `qemu-system-riscv64`).

```sh
zevic --freestanding --target riscv64-unknown-elf -T linker.ld --entry _start \
    src/Main.zev native/boot.S -o kernel.elf
qemu-system-riscv64 -machine virt -bios none -kernel kernel.elf -nographic -serial stdio
```

```text
Hello, World!
```

- `-T` (`--linker-script`) is the linker script and `--entry` is the entry symbol
- `--cflag` and `--ldflag` add arguments for the C compiler and the linker
- name a `.o` file, as in `-o kernel.o`, to make only an object and not link

## 3. What you can and cannot write {#o3}

Anything that needs the runtime is a **compile error**. You do not find out when it breaks at run time; you find out when you write it.

| You can write | You cannot write |
| --- | --- |
| integers, floats, `Bool`, `let` / `mut`, `if` / `match` / `while` / `for` | `Array`, `Map`, classes, closures, `async` |
| `struct`, `enum`, generics, `interface` | allocating values the GC manages |
| string literals, and their `Len` and `ByteAt` | joining or interpolating strings (they need a heap) |
| `unsafe`, `Unsafe.Alloc` and `Free`, the pointer's `Read` and `Write` | most of the standard library (`Fs`, `Console` and so on) |

When you need memory, you handle a region you prepared yourself with [`Unsafe`](/en/unsafe/).

## 4. Reading and writing registers {#o4}

For memory-mapped I/O, 0.6.0 adds:

- `Unsafe.At<T>(address)`: makes a `*T` from a numeric address
- `p.Address()`: the number of a pointer
- `p.ReadVolatile(i)` and `p.WriteVolatile(i, v)`: reads and writes the compiler will neither remove nor merge

Even reading a device register can have an effect, so use `ReadVolatile` and `WriteVolatile`, not `Read` and `Write`.

## 5. In zevic.toml {#o5}

It works in a `zevpm` package too. A `[freestanding]` section in `zevic.toml` makes the package freestanding. Only a package with `kind = "bin"` can have it.

```toml
[package]
name = "Kernel"
version = "0.1.0"
kind = "bin"

[freestanding]
target = "riscv64-unknown-elf"
linker_script = "linker.ld"
entry = "_start"
```

The keys are `target`, `linker_script`, `entry`, `cflags` and `ldflags`, and all of them are optional. `zevpm build` makes `build/Kernel.elf`. It is not for running on the host, so `zevpm run` and `zevpm test` refuse, and say why.

## 6. When something fails: zevic_panic {#o6}

Zevic code can fail a run-time check, such as an index out of range or a division by zero. Normally it prints a message and exits, but an OS has nowhere to exit to.

So when the code can fail, you must **write `export "C" fn zevic_panic(msg: *U8, len: CLongLong, file: *U8, line: CInt)` yourself**. Decide what is right for your system: print to the UART, halt, or reboot. If you do not write it, you find out at link time.
