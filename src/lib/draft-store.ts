/**
 * IndexedDB store for PDF blobs that cannot go into localStorage.
 *
 * One database, one object store keyed by sectionId. Each record is:
 *   { id: string; blob: Blob; name: string }
 *
 * All operations are fire-and-forget safe — callers don't have to await
 * them for correctness; the worst case is a draft that restores without
 * its PDF reference pane.
 */

const DB_NAME   = "quizzo-draft";
const DB_VER    = 1;
const STORE     = "pdf-blobs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export interface StoredPdf {
  id: string;
  blob: Blob;
  name: string;
}

export async function savePdfBlob(id: string, blob: Blob, name: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put({ id, blob, name });
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror   = () => { db.close(); reject(req.error); };
  });
}

export async function loadPdfBlob(id: string): Promise<StoredPdf | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => { db.close(); resolve((req.result as StoredPdf) ?? null); };
    req.onerror   = () => { db.close(); reject(req.error); };
  });
}

export async function deletePdfBlob(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror   = () => { db.close(); reject(req.error); };
  });
}

/** Load all stored blobs at once — used on draft restore. */
export async function loadAllPdfBlobs(): Promise<StoredPdf[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result as StoredPdf[]); };
    req.onerror   = () => { db.close(); reject(req.error); };
  });
}

/** Remove every record — called when the draft is discarded. */
export async function clearAllPdfBlobs(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).clear();
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror   = () => { db.close(); reject(req.error); };
  });
}
