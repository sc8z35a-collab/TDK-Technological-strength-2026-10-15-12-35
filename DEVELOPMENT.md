# 開発ガイド（TDK Technology Atlas 2026）

3D紹介サイトのソースの構成と、章（チャプター）を追加・編集するときの約束ごとです。

## ビルドと確認

```bash
npm install                      # 初回のみ（PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 推奨）
npm run build                    # src/ → docs/index.html（three.js込みの単一HTML）
node scripts/screenshot.mjs 3.1@4 # 章3・ステップ1を4秒早送りして撮影 → shots/
SIZES="844x390,1920x1080" WAIT=6000 node scripts/screenshot.mjs 0.0
```

- 撮影はヘッドレスChromium（SwiftShader）なので遅い。`@秒数` でアニメーション時計を早送りできる（`App.skip()`）。
- `?lab` を付けると開発用の部品ギャラリー章が末尾に追加される（`node scripts/screenshot.mjs "?lab#18.0@1"`）。
- 公開は GitHub Pages（`docs/` フォルダ）。`docs/index.html` はビルド成果物なので直接編集しない。

## ディレクトリ

| パス | 役割 |
|---|---|
| `src/main.js` | 起動。WebGL2チェック → `App` |
| `src/core/App.js` | レンダラ、章の切り替え（ディゾルブ遷移）、入力、ループ、全画面 |
| `src/core/Chapter.js` | 章の基底クラス（シーン・カメラ・ラベル・パラメータ補間） |
| `src/core/CameraRig.js` | カメラ。ポーズ `{pos, target, fov, dur}` 間を弧を描いて移動、ドラッグで軌道回転 |
| `src/core/Post.js` | HDRポスト処理（ブルーム、AgXトーンマップ、ビネット、粒状感、遷移） |
| `src/core/Env.js` | 環境マップ（`studio` 暗いスタジオ / `gallery` 明るい展示室 / `space` / `dawn`） |
| `src/core/kit.js` | 材質プリセット `materials()`、形状ヘルパ、`withDissolve()`、`textPlane()` |
| `src/core/parts.js` | 部品モデル（MLCC、CMF、パワーインダクタ、NTC、ディスク部品、フィルムコン、電解コン、パウチ電池、LGA、電源、基板テクスチャ） |
| `src/core/charts.js` | GPUで変形する円弧セグメント（リングチャート用） |
| `src/core/fx.js` | 背景グラデーション `Backdrop`、浮遊する塵 `Dust`、`softShadow`、`lightShaft` |
| `src/core/textures.js` | 手続きテクスチャ（粒子、ヘアライン、しわ、プラッタの異方性）、`canvasTexture()` |
| `src/chapters/*.js` | 各章の3Dシーン。`index.js` の `REGISTRY` で章IDと対応 |
| `src/content/chapters.js` | 全章の本文（見出し・リード・数値・詳細パネル・出典） |
| `src/ui/Overlay.js` + `src/styles.css` | 字幕、3Dラベル、目次、詳細パネル、ルーラー型の進捗バー |

## 章クラスの書き方

```js
import * as THREE from 'three';
import { Chapter } from '../core/Chapter.js';
import { materials } from '../core/kit.js';
import { spot } from './common.js';

export class MyChapter extends Chapter {
  constructor(app, def, index) {
    super(app, def, index);
    this.env = 'studio';      // 'studio' | 'gallery' | 'space' | 'dawn'
    this.exposure = 1.0;
    this.shift = 0.2;         // 被写体を右へ寄せる量（左側に字幕が出るため）
    this.look = { bloom: 0.12, threshold: 1.0, vignette: 0.38 }; // ポスト処理の調整
  }
  build() {               // 初回表示の直前に1回だけ呼ばれる
    const M = materials();
    this.addBackdrop({ top: '#121315', bottom: '#050506', glow: '#272019', glowPos: [0.66, 0.56] });
    this.addDust({ count: 300 });
    // this.add(mesh) で追加（破棄時にジオメトリも解放される）
    // ラベル: this.label({ text, sub, anchor, offset:[dx,dy], when: () => this.step === 1 && this.stepTime > 1.5 })
    //   anchor は Vector3 / [x,y,z] / Object3D / (out) => out.set(...)（outに書いて返す）
  }
  poses() {               // ステップごとのカメラ。content の steps と同じ数
    return [{ pos: [3, 2, 6], target: [0, 0.8, 0], fov: 32, dur: 2.4 }];
  }
  onStep(step, instant) {} // ステップが変わったとき
  tick(dt, t) {}           // 毎フレーム。this.step / this.stepTime / this.to('k', v) + this.param('k')
}
```

- 1章の中で複数の「ステーション」を x 方向に離して置き（例 x=0, 14, 28…）、ステップごとにカメラを移動させるのが基本形。
- `this.to(name, target)` / `this.param(name)` は時間で滑らかに補間される可逆パラメータ。戻るボタンでも破綻しない。
- 1フレームで重い処理をしない。インスタンス数が多いものは `InstancedMesh`。品質は `this.app.quality.tier`（`particles` 係数、`shadows`、`shadowSize`）。
- 影：`spot(this.scene, { shadow: q.shadows, shadowSize: q.shadowSize })`。シェーダで頂点を動かす物体は `customDepthMaterial` が必要。
- キャンバスで文字を描くテクスチャは `canvasTexture()`（2の累乗サイズに自動調整、フォント読み込み後に描画される）。

## 見た目の約束

- **ネオン調は禁止。** 発光は控えめに（温かい白・琥珀・銅の色味、強度は低め）。蛍光色の線やギラギラしたグローは使わない。
- 写真のような質感：物理ベース材質＋環境マップ＋スポットライトの影。暗いスタジオ（銅・グラファイト・磁器）と、明るい展示室の2系統。
- 文字情報は HTML の字幕とラベルで出す（3D内の文字は年号・刻印など最小限）。
- 字幕は画面左45%に出るので、主役は右側へ。スマホ横画面（844×390 など）で必ず確認する。
- 数値はすべて `research/TDK_research_notes.md` の一次資料にもとづく。推測の数値を足さない。

## 注意

- 本サイトは公開情報にもとづく **非公式の学習用コンテンツ** です。TDKのロゴや商標の画像は使いません。
