// songs.json のエントリを解決して playlist.json を生成するスクリプト。
// GitHub Actions から実行される想定（Node 20+ / fetch 標準搭載）。
// - file エントリ: リポジトリ内の音声ファイル（audio/*.mp3 など）をそのまま使う
// - url エントリ : Suno 共有リンクを解決する（現在 Suno は外部再生をブロック中）
// さらに audio/ フォルダ内で songs.json に未登録の mp3 は自動で末尾に追加する。

import { readFile, writeFile, access, readdir } from "node:fs/promises";

const SONGS_FILE = "songs.json";
const PLAYLIST_FILE = "playlist.json";
const AUDIO_DIR = "audio";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
};

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// 貼り付けミス（URLの二重貼りや Markdown リンク形式など）から
// Suno のリンク部分だけを救出する。最後に現れたリンクを採用する。
function normalizeUrl(raw) {
  const matches = String(raw).match(
    /https:\/\/suno\.com\/(?:s|song)\/[A-Za-z0-9_-]+/g
  );
  return matches ? matches[matches.length - 1] : String(raw).trim();
}

function extractMeta(html, prop) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*?content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*?(?:property|name)=["']${prop}["']`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeHtml(m[1]);
  }
  return undefined;
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'");
}

// ファイル名（拡張子なし）を表示用タイトルに変換する
function titleFromFilename(file) {
  return file
    .replace(/^.*\//, "")
    .replace(/\.[^.]+$/, "")
    .trim();
}

// リポジトリ内のファイルを指すトラックを作る。パスはURLエンコードして audio に入れる
async function resolveLocalFile(entry) {
  const file = String(entry.file).replace(/\\/g, "/").replace(/^\.?\//, "");
  await access(file); // 存在しなければ throw
  return {
    sourceFile: file,
    title: entry.title || titleFromFilename(file),
    audio: file.split("/").map(encodeURIComponent).join("/"),
    image: entry.image || null,
    ...(entry.pageUrl ? { pageUrl: entry.pageUrl } : {}),
  };
}

async function resolveSong(entry) {
  const track = { sourceUrl: entry.url };

  // songs.json に id が直接書かれていれば取得をスキップできる
  let id = entry.id;
  let html = "";

  if (!id || !entry.title) {
    const res = await fetch(entry.url, {
      headers: HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${entry.url}`);
    }
    const finalUrl = res.url || entry.url;
    html = await res.text();
    track.pageUrl = finalUrl;

    if (!id) {
      const fromUrl = finalUrl.match(UUID_RE);
      if (fromUrl) {
        id = fromUrl[0];
      } else {
        // ページ内の og:url や埋め込み URL から探す
        const ogUrl = extractMeta(html, "og:url") || "";
        const fromOg = ogUrl.match(UUID_RE) || html.match(UUID_RE);
        if (fromOg) id = fromOg[0];
      }
    }
  }

  if (!id) throw new Error(`could not find song UUID for ${entry.url}`);

  track.id = id.toLowerCase();
  track.pageUrl = track.pageUrl || `https://suno.com/song/${track.id}`;
  track.title =
    entry.title ||
    (extractMeta(html, "og:title") || "").replace(/\s*(\||by)\s*Suno.*$/i, "").trim() ||
    `Track ${track.id.slice(0, 8)}`;
  track.audio =
    entry.audio ||
    extractMeta(html, "og:audio") ||
    `https://cdn1.suno.ai/${track.id}.mp3`;
  track.image = entry.image || extractMeta(html, "og:image") || null;
  return track;
}

async function main() {
  const songs = JSON.parse(await readFile(SONGS_FILE, "utf8")).songs || [];

  let previous = [];
  try {
    previous = JSON.parse(await readFile(PLAYLIST_FILE, "utf8")).tracks || [];
  } catch {
    // 初回実行時は playlist.json が存在しない
  }
  const cache = new Map(
    previous.filter((t) => t.id && !t.error).map((t) => [t.sourceUrl, t])
  );

  const tracks = [];
  let failures = 0;

  for (const entry of songs) {
    // ローカルファイル指定はネットワーク取得なしでそのまま採用
    if (entry.file) {
      try {
        const track = await resolveLocalFile(entry);
        tracks.push(track);
        console.log(`local  : ${track.sourceFile} -> ${track.title}`);
      } catch {
        failures++;
        console.error(`FAILED : ${entry.file} : file not found`);
        tracks.push({ sourceFile: entry.file, error: "file not found" });
      }
      continue;
    }

    if (!entry.url) continue;
    entry.url = normalizeUrl(entry.url);

    const cached = cache.get(entry.url);
    if (cached && !entry.title && !entry.id) {
      tracks.push(cached);
      console.log(`cached : ${entry.url} -> ${cached.title}`);
      continue;
    }

    try {
      const track = await resolveSong(entry);
      tracks.push(track);
      console.log(`resolved: ${entry.url} -> ${track.title} (${track.id})`);
    } catch (err) {
      failures++;
      console.error(`FAILED : ${entry.url} : ${err.message}`);
      if (cached) {
        tracks.push(cached);
      } else {
        tracks.push({ sourceUrl: entry.url, error: String(err.message) });
      }
    }
    // 連続アクセスを避ける
    await new Promise((r) => setTimeout(r, 1500));
  }

  // audio/ フォルダ内で songs.json に未登録の音声ファイルを末尾に自動追加
  try {
    const listed = new Set(
      tracks.filter((t) => t.sourceFile).map((t) => t.sourceFile)
    );
    const files = (await readdir(AUDIO_DIR))
      .filter((f) => /\.(mp3|m4a|wav|ogg)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, "ja"));
    for (const f of files) {
      const rel = `${AUDIO_DIR}/${f}`;
      if (listed.has(rel)) continue;
      const track = await resolveLocalFile({ file: rel });
      tracks.push(track);
      console.log(`auto   : ${rel} -> ${track.title}`);
    }
  } catch {
    // audio/ フォルダが無い場合は何もしない
  }

  const playlist = {
    generatedAt: new Date().toISOString(),
    tracks,
  };
  await writeFile(PLAYLIST_FILE, JSON.stringify(playlist, null, 2) + "\n");
  console.log(
    `\nwrote ${PLAYLIST_FILE}: ${tracks.length} tracks (${failures} failed)`
  );

  // 全曲失敗した場合のみエラー終了（部分的な失敗はコミットを許可）
  if (songs.length > 0 && tracks.every((t) => t.error)) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
