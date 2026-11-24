export class DraftStorageError extends Error {
  constructor(public code:"storage-unavailable"|"storage-conflict"|"storage-invalid"){super(code);}
}
export function idbRequest<T>(value:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error);});}
export async function openBrowserDb(factory:IDBFactory|undefined=globalThis.indexedDB){
  if(!factory)throw new DraftStorageError("storage-unavailable");
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const opening=factory.open("harn-tee-drafts",2);let failed=false;
    opening.onupgradeneeded=()=>{
      const database=opening.result;
      if(!database.objectStoreNames.contains("records"))database.createObjectStore("records");
      if(!database.objectStoreNames.contains("aliases"))database.createObjectStore("aliases").createIndex("localId","localId");
      if(!database.objectStoreNames.contains("qrAssets"))database.createObjectStore("qrAssets").createIndex("localId","localId");
      if(!database.objectStoreNames.contains("history")){
        const history=database.createObjectStore("history");history.createIndex("billId","billId",{unique:true});history.createIndex("lastActivityAt","lifecycle.lastActivityAt");
      }
    };
    opening.onerror=()=>reject(new DraftStorageError("storage-unavailable"));
    opening.onblocked=()=>{failed=true;reject(new DraftStorageError("storage-unavailable"));};
    opening.onsuccess=()=>{if(failed)opening.result.close();else resolve(opening.result);};
  });
  let closed=false;const close=()=>{closed=true;db.close();};db.onversionchange=close;
  async function transaction<T>(mode:IDBTransactionMode,run:(tx:IDBTransaction)=>Promise<T>):Promise<T>{
    if(closed)throw new DraftStorageError("storage-unavailable");
    const tx=db.transaction(["records","aliases","qrAssets","history"],mode);
    const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new DraftStorageError("storage-unavailable"));tx.onabort=()=>reject(tx.error??new DraftStorageError("storage-invalid"));});
    void done.catch(()=>undefined);
    try{const value=await run(tx);await done;return value;}catch(error){try{tx.abort();}catch{}await done.catch(()=>undefined);throw error;}
  }
  return {transaction,close};
}
export type BrowserDb=Awaited<ReturnType<typeof openBrowserDb>>;
