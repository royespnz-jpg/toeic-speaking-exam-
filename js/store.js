// Every recording is kept in the browser (IndexedDB) until the teacher's
// script has it, so nothing is lost if the connection drops.

const DB = 'speaking-exam';
const STORE = 'recordings';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

export const saveRecording = (rec) => tx('readwrite', (s) => s.put(rec)).catch(() => null);
export const getRecording = (key) => tx('readonly', (s) => s.get(key)).catch(() => null);
export const allRecordings = () => tx('readonly', (s) => s.getAll()).catch(() => []);
export const deleteRecording = (key) => tx('readwrite', (s) => s.delete(key)).catch(() => null);
