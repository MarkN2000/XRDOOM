# XRDOOM

XRift内のレトロPCでDOOMを遊べる非公式ワールド。PC・スマホ・VRに対応しています。
周りの人も自動で観戦でき、音声はモニター横のボタンでONにできます。

DOOMの実行には、[ozkl/doomgeneric](https://github.com/ozkl/doomgeneric)をXRift向けに改変して使用しています。

XRDOOMは、DOOMの権利者およびXRift非公認のファンプロジェクトです。

PCまたは椅子を選んで着席し、モニターを選ぶと開始します。操作説明はワールド内に表示されます。

## 開発

Node.js 22.12以降、Git、Python、[Emscripten 7.0.0](https://emscripten.org/docs/getting_started/downloads.html)が必要です。
ビルド時にSDLの設定を変更するため、専用のEmscripten環境を用意し、`EMSDK`を設定してください。

```sh
npm ci
npm run fetch:shareware
npm run build:doom
npm run check
npm run dev
```

`check`はビルドとXRiftのコード検査を行います。エンジン変更後は`build:doom`から実行してください。
プレビューはPCでの単独プレイ向けです。スマホ・VRはHTTPS、複数人の動作はXRift上で確認してください。

## XRiftへアップロード

```sh
npx xrift login
npx xrift upload world
```

## ライセンス

コードは[GPL-2.0-or-later](LICENSE)。素材にはそれぞれの利用条件が適用されます。
[素材・クレジット](licenses/ASSETS.md)／[第三者ライセンス](public/THIRD_PARTY_NOTICES.txt)／[改変内容](licenses/CHANGES.md)

DOOMのゲームデータは含めていません。取得時は[Sharewareの利用条件](public/DOOM-SHAREWARE-LICENSE.txt)に従ってください。
