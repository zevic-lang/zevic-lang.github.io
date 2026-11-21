---
title: Install
permalink: /en/install/
alt: /install/
lead: clang comes with it. Pick your platform.
---
Zevic uses clang (15 or newer). The installation methods below set clang up for you as well.

## Ubuntu / Debian (amd64)

```sh
curl -fsSL https://zevic-lang.github.io/zevic/zevic.gpg | sudo tee /usr/share/keyrings/zevic.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/zevic.gpg] https://zevic-lang.github.io/zevic stable main" | sudo tee /etc/apt/sources.list.d/zevic.list
sudo apt update && sudo apt install zevic
```

To install a `.deb` directly, use `zevic_{{ site.version }}_amd64.deb` from the [releases](https://github.com/zevic-lang/zevic/releases/latest).

## Windows

```powershell
winget install zevic-lang.Zevic
```

This also installs LLVM (`LLVM.LLVM`). The Visual Studio Build Tools are needed for linking. `zevic-{{ site.version }}-windows-x64-setup.exe` (an installer) and a `.zip` are on the [releases](https://github.com/zevic-lang/zevic/releases/latest) page too. For Windows on Arm there is a `windows-arm64` `setup.exe` and `.zip`.

The installer has an unchecked "Install Zig" option (see [Building for another system](#building-for-another-system)). A silent install selects it with `/TASKS="zig"`.

## macOS

Run `brew install llvm` first, then install `zevic-{{ site.version }}-macos-arm64.pkg` (Apple Silicon) or `zevic-{{ site.version }}-macos-x64.pkg` (Intel) from the [releases](https://github.com/zevic-lang/zevic/releases/latest), or use `install.sh`.

## Linux (tar.gz)

Extract `zevic-{{ site.version }}-linux-x64.tar.gz` (`linux-arm64` for Arm) and put its `bin` directory on your `PATH`. Install clang separately (for example `sudo apt install clang`). `install.sh` in the extracted directory installs to `~/.local` if you prefer.

## Building for another system

`--target` builds an executable for another OS and CPU. The names are `linux-x64`, `linux-arm64`, `macos-x64`, `macos-arm64`, `windows-x64` and `windows-arm64`.

```sh
zevic --target windows-x64 hello.zev -o hello.exe
zevpm build --target linux-arm64     # writes to build/linux-arm64/
```

You need the C headers and libraries of that system. The easiest way is [Zig](https://ziglang.org/), which carries them for Linux, Windows and macOS. You can choose it at install time:

```sh
sh install.sh --with-zig             # Windows: .\install.ps1 -WithZig
```

Zig is checked against its SHA-256 and put next to `zevic`. It is used automatically when you pass `--target`, and also when `ZEVIC_CLANG` points to `zig`. Windows targets use the MinGW ABI. The program only runs on that system, so `zevpm run` and `--test` cannot be combined with `--target`.

## Termux (Android)

There is no prebuilt package yet. Build from source.

```sh
pkg install clang make git
git clone https://github.com/zevic-lang/zevic
cd zevic
make
export ZEVIC_HOME="$PWD"
export PATH="$PWD/build:$PATH"
```

## Build from source

You need `make` and clang 15 or newer. No C compiler is needed.

```sh
git clone https://github.com/zevic-lang/zevic
cd zevic
make            # build/zevic, build/zevpm, build/zevfmt
make test       # golden tests, zevpm tests and the examples
./build/zevic examples/01_hello/src/Main.zev -o hello && ./hello
```

## Check that it works

```zevic
module Main

import Zevic.Console

fn Main() {
    Console.Println("Hello, World!")
}
```

```sh
zevic hello.zev -o hello
./hello
```

## Troubleshooting

- If you see `clang was not found`, install clang or point `ZEVIC_CLANG` at it
- If the standard library cannot be found, set `ZEVIC_HOME` to the repository (or to `share/zevic`)
- The first build compiles the runtime and the GC once and stores them in `~/.cache/zevic` (`%LOCALAPPDATA%\zevic\cache` on Windows; change it with `ZEVIC_CACHE`)
