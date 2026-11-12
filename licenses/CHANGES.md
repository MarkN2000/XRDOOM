# 第三者コードの取り込みと改変

## doomgeneric

上流：<https://github.com/ozkl/doomgeneric>

コミット：`e257a09527062bfb986b6e5e0780839b6cbd5b71`

Cソース・ヘッダーとビルド入力を収録しています。上流のゲームコードは改変せず、
XRDOOM固有の描画・音声・入力・一時停止処理を`scripts/doom_bridge.c`で実装しています。
上流ライセンスは`vendor/doomgeneric/LICENSE`です。

## XRiftテンプレート

上流：<https://github.com/WebXR-JP/xrift-world-template>

コミット：`a873393fc1b756ecd46a4a693ea681ef4f49eb6d`

ビルド設定と開発エントリーを元にワールドを実装しています。元のMIT通知は第三者通知に含めています。

## SDL 2.32.10 / Emscripten 7.0.0

2026-11-12までの変更：音声キャプチャを無効化し、動画・ジョイスティック・センサー・電源管理の不要な機能を無効化しました。
ゲーム音声はWeb Audioのゲートを通すため、SDLから音声出力先への自動接続を外しています。
変更は`scripts/build-doom.mjs`で適用し、対応ソースZIPには使用したSDLソースとポートスクリプトも含めます。
SDL_mixer 2.8.0はMIDI再生に使用します。

## VDO.Ninja SDK 1.6.2

上流：<https://github.com/steveseguin/ninjasdk>

2026-11-12までの変更：ESモジュール化、永続ストレージの無効化、TURN応答のタイムアウトと接続先検証。
`scripts/prepare-vdo.mjs`が依存パッケージから改変版を生成します。
生成した改変ソースとMPL-2.0通知をワールドの対応ソースZIPに含めます。
改変版はMPL-2.0第3.3条に従い、GPL-2.0-or-laterでも提供します。

## XRift SDK 0.2.1

Windowsでのアップロード先パスを`/`区切りへ正規化する修正をインストール時に適用します。
`scripts/prepare-xrift.mjs`を参照してください。SDKを更新するときはこの修正が引き続き必要か確認してください。
