# 🎵 Suno Music Player

Suno で制作した楽曲をブラウザでループ再生できるミュージックプレイヤーです。
GitHub Pages でそのまま公開でき、ポートフォリオからリンクして聴いてもらえます。

## 機能

- 🔁 全曲ループ / 1曲リピート / リピートなし の切り替え（デフォルトは全曲ループ）
- 🔀 シャッフル再生
- ⏯ シークバー・音量調整・キーボード操作（Space で再生/停止、Shift+←→ で曲送り）
- 📱 レスポンシブ対応、Media Session API 対応（スマホのロック画面から操作可能）
- ➕ `audio/` フォルダに mp3 を入れて push するだけで曲を追加できる

## 公開方法（GitHub Pages）

1. リポジトリの **Settings → Pages** を開く
2. **Source: Deploy from a branch** を選択
3. **Branch** にこのファイルがあるブランチ（例: `claude/suno-music-player-958zyp`、`main` にマージした場合は `main`）、フォルダは **`/ (root)`** を選んで Save
4. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開されます

> **注意:** GitHub Pages はプライベートリポジトリでは無料プランで使えません。
> その場合は、公開用に新しいパブリックリポジトリを作ってこのファイル一式を置いてください。

## 曲の追加方法

> **注意:** 以前は Suno の共有リンク（`https://suno.com/s/...`）から音声 URL を
> 自動取得していましたが、現在 Suno は外部サイトからの音声再生をブロックしているため
> （CDN が署名付き URL 必須になりました）、**mp3 ファイルをリポジトリに置く方式**に変更しています。

1. Suno の曲ページから mp3 をダウンロード
2. `audio/` フォルダに mp3 ファイルを入れる
3. コミットして push すると、GitHub Actions（`Update playlist`）が自動で
   `playlist.json` を更新します（曲名はファイル名から自動設定）
4. GitHub の **Actions** タブでワークフローの完了を確認（1〜2分）

タイトル・ジャケット画像・Suno ページへのリンクを指定したい場合は、
`songs.json` の `songs` 配列にエントリを書きます（書いた順に再生されます）:

```json
{
  "file": "audio/曲のファイル名.mp3",
  "title": "表示したい曲名",
  "image": "https://cdn2.suno.ai/xxxx.jpeg",
  "pageUrl": "https://suno.com/song/xxxx"
}
```

`songs.json` に書いていない `audio/` 内の mp3 は、プレイリストの末尾に自動で追加されます。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | プレイヤー本体（依存ライブラリなしの単一ファイル） |
| `audio/` | **mp3 を入れるのはここ** — 曲の音声ファイル |
| `songs.json` | 曲順・タイトル・画像などを指定する元データ |
| `playlist.json` | 自動生成される再生用データ（直接編集しない） |
| `scripts/resolve-playlist.mjs` | playlist.json を生成するスクリプト |
| `.github/workflows/update-playlist.yml` | songs.json / audio 変更時に playlist.json を自動更新 |

## ローカルで確認する

```bash
npx serve .
# または
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます（`file://` 直接開きでは playlist.json の読み込みがブロックされます）。

---

Music generated with [Suno](https://suno.com)
