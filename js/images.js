// 画像の管理（ブラウザ内のみ。外部送信なし）
//
// - 追加した画像は長辺 MAX_EDGE px までに縮小してメモリ使用量を抑える
// - Blob を IndexedDB に保存し、再読み込み後も使えるようにする（失敗時はメモリのみ）
// - プレビュー用に Blob URL、コピー用に data URL を保持する

const MAX_EDGE = 1600;
const KEEP_ORIGINAL_BYTES = 1.5 * 1024 * 1024;
const DB_NAME = 'note-paste-studio';
const STORE = 'images';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB非対応'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした（非対応の形式の可能性があります）'));
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像の変換に失敗しました'))), type, quality);
  });
}

async function processFile(file) {
  const srcUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(srcUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    const passThrough =
      scale === 1 &&
      file.size <= KEEP_ORIGINAL_BYTES &&
      ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type);
    // GIFはアニメーションを保つため、極端に大きくなければそのまま使う
    if (passThrough || (file.type === 'image/gif' && file.size <= 5 * 1024 * 1024)) {
      return { blob: file, width: w, height: h };
    }
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cw, ch);
    }
    ctx.drawImage(img, 0, 0, cw, ch);
    const blob = await canvasToBlob(canvas, type, 0.86);
    canvas.width = canvas.height = 0; // iOSのキャンバスメモリを早めに解放
    return { blob, width: cw, height: ch };
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}

/** クリップボード用に PNG へ変換する（Safari が対応する画像形式は image/png のみ） */
export async function toPngBlob(blob) {
  if (blob.type === 'image/png') return blob;
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    const png = await canvasToBlob(canvas, 'image/png');
    canvas.width = canvas.height = 0;
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function newId() {
  const a = new Uint8Array(5);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-3);
}

export class ImageStore {
  constructor() {
    this.items = new Map();
    this.db = null;
    this.persistError = null;
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }

  async init() {
    try {
      this.db = await openDb();
      const rows = await tx(this.db, 'readonly', (s) => s.getAll());
      for (const r of rows || []) this.attach(r);
    } catch (e) {
      this.db = null;
      this.persistError = e;
    }
    this.emit();
  }

  attach(rec) {
    const item = {
      ...rec,
      url: URL.createObjectURL(rec.blob),
      dataUrl: null,
    };
    item.dataUrlPromise = blobToDataUrl(rec.blob).then((d) => (item.dataUrl = d));
    this.items.set(rec.id, item);
    return item;
  }

  /** テスト用の組み込み画像（同一オリジンのファイル）を登録する。保存はしない */
  async addBuiltin(id, path, name) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`テスト画像を取得できません（${res.status}）`);
    const blob = await res.blob();
    const img = await loadImage(URL.createObjectURL(blob));
    const item = this.attach({
      id,
      name,
      blob,
      width: img.naturalWidth,
      height: img.naturalHeight,
      size: blob.size,
      builtin: true,
      publicUrl: new URL(path, location.href).href,
    });
    URL.revokeObjectURL(img.src);
    await item.dataUrlPromise;
    this.emit();
    return item;
  }

  async addFile(file) {
    const { blob, width, height } = await processFile(file);
    const rec = {
      id: newId(),
      name: (file.name || '画像').replace(/\.[a-z0-9]+$/i, ''),
      blob,
      width,
      height,
      size: blob.size,
      createdAt: Date.now(),
    };
    if (this.db) {
      try {
        await tx(this.db, 'readwrite', (s) => s.put(rec));
      } catch (e) {
        this.persistError = e;
      }
    }
    const item = this.attach(rec);
    this.emit();
    return item;
  }

  async remove(id) {
    const item = this.items.get(id);
    if (!item) return;
    URL.revokeObjectURL(item.url);
    this.items.delete(id);
    if (this.db && !item.builtin) {
      try {
        await tx(this.db, 'readwrite', (s) => s.delete(id));
      } catch (e) {
        this.persistError = e;
      }
    }
    this.emit();
  }

  get(id) {
    return this.items.get(id) || null;
  }

  /** "img:xxxx" から画像を取得 */
  fromRef(ref) {
    return ref && ref.startsWith('img:') ? this.get(ref.slice(4)) : null;
  }

  list() {
    return [...this.items.values()];
  }

  totalBytes() {
    let t = 0;
    for (const it of this.items.values()) t += it.size || 0;
    return t;
  }

  whenDataUrlsReady() {
    return Promise.all(this.list().map((it) => it.dataUrlPromise));
  }
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
