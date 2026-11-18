---
title: インストール
permalink: /install/
lead: clang と一緒に入ります。お使いの環境を選んでください。
alt: /en/install/
---
Zevic は clang（15 以上）を使います。次のインストール方法は clang も一緒に用意します。

## Ubuntu / Debian（amd64）

```sh
curl -fsSL https://zevic-lang.github.io/zevic/zevic.gpg | sudo tee /usr/share/keyrings/zevic.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/zevic.gpg] https://zevic-lang.github.io/zevic stable main" | sudo tee /etc/apt/sources.list.d/zevic.list
sudo apt update && sudo apt install zevic
```

`.deb` を直接入れたい場合は[リリース](https://github.com/zevic-lang/zevic/releases/latest)の `zevic_{{ site.version }}_amd64.deb` を使えます。

## Windows

```powershell
winget install zevic-lang.Zevic
```

LLVM（`LLVM.LLVM`）も一緒に入ります。リンクには Visual Studio Build Tools が必要です。`zevic-{{ site.version }}-windows-x64-setup.exe`（インストーラー）や `.zip` も[リリース](https://github.com/zevic-lang/zevic/releases/latest)にあります。

## macOS（Apple Silicon）

先に `brew install llvm` を実行し、[リリース](https://github.com/zevic-lang/zevic/releases/latest)から `zevic-{{ site.version }}-macos-arm64.pkg` を入れるか、`install.sh` を使います。

## Linux（tar.gz）

`zevic-{{ site.version }}-linux-x64.tar.gz` を展開し、`bin` を `PATH` に通します。clang は別に入れてください（`sudo apt install clang` など）。

## Termux（Android）

ビルド済みのパッケージはまだありません。ソースからビルドします。

```sh
pkg install clang make git
git clone https://github.com/zevic-lang/zevic
cd zevic
make
export ZEVIC_HOME="$PWD"
export PATH="$PWD/build:$PATH"
```

## ソースからビルドする

`make` と clang 15 以上があれば、C コンパイラなしでビルドできます。

```sh
git clone https://github.com/zevic-lang/zevic
cd zevic
make            # build/zevic, build/zevpm, build/zevfmt
make test       # ゴールデンテスト・zevpm のテスト・examples
./build/zevic examples/01_hello/src/Main.zev -o hello && ./hello
```

## 動作確認

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

## 困ったとき

- `clang was not found` と出たら、clang を入れるか `ZEVIC_CLANG` で場所を指定してください
- 標準ライブラリが見つからないときは、`ZEVIC_HOME` にリポジトリ（または `share/zevic`）の場所を指定します
- 初回のビルドではランタイムと GC を一度だけコンパイルし、`~/.cache/zevic`（Windows は `%LOCALAPPDATA%\zevic\cache`、`ZEVIC_CACHE` で変更可）に保存します
