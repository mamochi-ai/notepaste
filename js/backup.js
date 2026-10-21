// バックアップ（記事と画像を1つのJSONファイルにまとめる）と復元

import { blobToDataUrl } from './images.js?v=202610211236';

const FORMAT = 'note-paste-studio-backup';
const ID_RE = /^[a-z0-9_-]{1,40}$/i;
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=]+)$/i;

/**
 * バックアップの中身を作る。画像の data URL がすべて用意できていれば同期的に作れる。
 * @param {import('./articles.js').ArticleStore} articles
 * @param {import('./images.js').ImageStore} store
 */
export async function buildBackup(articles, store) {
  const used = articles.usedImageIds();
  const images = [];
  for (const it of store.list()) {
    if (it.builtin || !used.has(it.id)) continue;
    images.push({
      id: it.id,
      name: it.name,
      width: it.width,
      height: it.height,
      createdAt: it.createdAt,
      dataUrl: it.dataUrl || (await blobToDataUrl(it.blob)),
    });
  }
  return JSON.stringify({
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    articles: articles.list.map(({ id, md, createdAt, updatedAt }) => ({ id, md, createdAt, updatedAt })),
    images,
  });
}

function dataUrlToBlob(dataUrl) {
  const m = dataUrl.match(DATA_URL_RE);
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1].toLowerCase() });
}

/**
 * バックアップファイルの中身を検証して取り出す。不正な項目は読み飛ばす。
 * @returns {{articles:Array, images:Array, skipped:number, exportedAt:string|null}}
 */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error('バックアップファイルを読み取れませんでした（JSONではありません）');
  }
  if (!data || data.format !== FORMAT || !Array.isArray(data.articles)) {
    throw new Error('note Paste Studio のバックアップファイルではありません');
  }
  let skipped = 0;
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  const articles = [];
  for (const a of data.articles) {
    if (!a || !ID_RE.test(a.id) || typeof a.md !== 'string') {
      skipped++;
      continue;
    }
    const now = Date.now();
    articles.push({ id: a.id, md: a.md, createdAt: num(a.createdAt, now), updatedAt: num(a.updatedAt, now) });
  }
  const images = [];
  for (const im of Array.isArray(data.images) ? data.images : []) {
    if (!im || !ID_RE.test(im.id) || typeof im.dataUrl !== 'string' || !DATA_URL_RE.test(im.dataUrl)) {
      skipped++;
      continue;
    }
    const blob = dataUrlToBlob(im.dataUrl);
    images.push({
      id: im.id,
      name: typeof im.name === 'string' ? im.name.slice(0, 100) : '画像',
      blob,
      width: num(im.width, 0) | 0,
      height: num(im.height, 0) | 0,
      size: blob.size,
      createdAt: num(im.createdAt, Date.now()),
    });
  }
  return { articles, images, skipped, exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null };
}
