// 複数の記事の保存（localStorage）。画像は images.js（IndexedDB）に別保存し、本文中の img:ID で参照する。

import { storageGet, storageSet } from './common.js?v=202610211236';

const ARTICLES_KEY = 'nps-articles';
const CURRENT_KEY = 'nps-current';
const LEGACY_DRAFT_KEY = 'nps-draft'; // 1記事だけ保存していた頃の下書き

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 記事のタイトル（先頭の「# 見出し」、なければ最初の行） */
export function articleTitle(md) {
  const h1 = String(md).match(/^ {0,3}# +(.+?) *#* *$/m);
  const first = h1 ? h1[1] : (String(md).split('\n').find((l) => l.trim()) || '').trim();
  const t = first.replace(/[*_`~]/g, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
  return t.length > 40 ? t.slice(0, 40) + '…' : t || '（無題）';
}

/** 本文が参照している画像ID */
export function imageIdsOf(md) {
  return new Set([...String(md).matchAll(/\]\(\s*img:([a-z0-9_-]+)\s*\)/gi)].map((m) => m[1]));
}

export class ArticleStore {
  constructor(initialMd) {
    let list = storageGet(ARTICLES_KEY, null);
    if (!Array.isArray(list) || !list.length) {
      const legacy = storageGet(LEGACY_DRAFT_KEY, null);
      list = [this.make(legacy ?? initialMd)];
    }
    this.list = list;
    const cur = storageGet(CURRENT_KEY, null);
    this.currentId = list.some((a) => a.id === cur) ? cur : this.sorted()[0].id;
    this.lastSaveOk = this.persist();
    if (this.lastSaveOk) {
      try {
        localStorage.removeItem(LEGACY_DRAFT_KEY);
      } catch (_) {
        /* 保存できない環境 */
      }
    }
  }

  make(md = '') {
    const now = Date.now();
    return { id: newId(), md, createdAt: now, updatedAt: now };
  }

  persist() {
    return storageSet(ARTICLES_KEY, this.list) && storageSet(CURRENT_KEY, this.currentId);
  }

  sorted() {
    return [...this.list].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get current() {
    return this.list.find((a) => a.id === this.currentId);
  }

  /** 現在の記事の本文を更新して保存する。保存できたかを返す */
  update(md) {
    const a = this.current;
    if (a.md === md) return this.lastSaveOk;
    a.md = md;
    a.updatedAt = Date.now();
    this.lastSaveOk = this.persist();
    return this.lastSaveOk;
  }

  open(id) {
    if (!this.list.some((a) => a.id === id)) return null;
    this.currentId = id;
    this.persist();
    return this.current;
  }

  create(md = '') {
    const a = this.make(md);
    this.list.push(a);
    this.currentId = a.id;
    this.lastSaveOk = this.persist();
    return a;
  }

  /** 記事を削除する。最後の1件を消したときは空の記事を作る */
  remove(id) {
    this.list = this.list.filter((a) => a.id !== id);
    if (!this.list.length) this.list.push(this.make(''));
    if (!this.list.some((a) => a.id === this.currentId)) this.currentId = this.sorted()[0].id;
    this.lastSaveOk = this.persist();
  }

  /** どれかの記事で使われている画像ID */
  /**
   * バックアップの記事を取り込む。同じIDの記事は更新日時が新しいほうを残す。
   * @returns {{added:number, updated:number, skipped:number}}
   */
  merge(list) {
    const r = { added: 0, updated: 0, skipped: 0 };
    for (const a of list) {
      const i = this.list.findIndex((x) => x.id === a.id);
      if (i < 0) {
        this.list.push({ ...a });
        r.added++;
      } else if (a.updatedAt > this.list[i].updatedAt) {
        this.list[i] = { ...a };
        r.updated++;
      } else r.skipped++;
    }
    this.lastSaveOk = this.persist();
    return r;
  }

  usedImageIds() {
    const ids = new Set();
    for (const a of this.list) for (const id of imageIdsOf(a.md)) ids.add(id);
    return ids;
  }
}
