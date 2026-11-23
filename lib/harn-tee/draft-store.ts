import { hashToken } from "./tokens";
import { makeBlankForm, parseStoredCheckpoint, sanitizeDraftForm, type Checkpoint, type CompletionCheckpoint, type DraftContext, type WorkingCheckpoint } from "./draft-state";

export class DraftStorageError extends Error {
  constructor(public code:"storage-unavailable"|"storage-conflict"|"storage-invalid"){super(code);}
}
export interface DraftStore {
  read(context:DraftContext):Promise<Checkpoint|null>;
  writeWorking(record:WorkingCheckpoint,expectedVersion:number|null,qrFile?:File):Promise<WorkingCheckpoint>;
  loadQr(localId:string,selectionId:string):Promise<File|null>;
  bindEditContext(localId:string,editToken:string,expectedVersion:number):Promise<WorkingCheckpoint>;
  writeCompletion(record:CompletionCheckpoint,expectedVersion:number):Promise<CompletionCheckpoint>;
  startNew(previousLocalId?:string):Promise<WorkingCheckpoint>;
  close():void;
}
type Alias={localId:string};
type Asset={localId:string;selectionId:string;blob:Blob;name:string;type:string};
function request<T>(value:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error);});}
async function contextKey(context:DraftContext){return context.kind==="new"?"new":"edit:"+await hashToken(context.editToken);}
export async function openDraftStore(factory:IDBFactory|undefined=globalThis.indexedDB):Promise<DraftStore>{
  if(!factory)throw new DraftStorageError("storage-unavailable");
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const opening=factory.open("harn-tee-drafts",1);let failed=false;
    opening.onupgradeneeded=()=>{
      const database=opening.result;
      database.createObjectStore("records");
      database.createObjectStore("aliases").createIndex("localId","localId");
      database.createObjectStore("qrAssets").createIndex("localId","localId");
    };
    opening.onerror=()=>reject(new DraftStorageError("storage-unavailable"));
    opening.onblocked=()=>{failed=true;reject(new DraftStorageError("storage-unavailable"));};
    opening.onsuccess=()=>{if(failed)opening.result.close();else resolve(opening.result);};
  });
  let closed=false;
  const close=()=>{closed=true;db.close();};db.onversionchange=close;
  async function transaction<T>(mode:IDBTransactionMode,run:(tx:IDBTransaction)=>Promise<T>):Promise<T>{
    if(closed)throw new DraftStorageError("storage-unavailable");
    const tx=db.transaction(["records","aliases","qrAssets"],mode);
    const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new DraftStorageError("storage-unavailable"));tx.onabort=()=>reject(tx.error??new DraftStorageError("storage-invalid"));});
    // Register immediately so an aborted transaction cannot create an unhandled rejection.
    void done.catch(()=>undefined);
    try{const value=await run(tx);await done;return value;}catch(error){try{tx.abort();}catch{}await done.catch(()=>undefined);throw error;}
  }
  const conflict=()=>{throw new DraftStorageError("storage-conflict");};
  async function current(tx:IDBTransaction,id:string,expected:number):Promise<Checkpoint>{
    const found=await request<unknown>(tx.objectStore("records").get(id));
    if(!found)return conflict();const parsed=parseStoredCheckpoint(found);
    if(parsed.localVersion!==expected)return conflict();
    if(await request(tx.objectStore("aliases").index("localId").count(id))===0)return conflict();
    return parsed;
  }
  async function removeAssets(tx:IDBTransaction,id:string){
    const assets=tx.objectStore("qrAssets"),keys=await request(assets.index("localId").getAllKeys(id));
    for(const key of keys)await request(assets.delete(key));
  }
  return {
    close,
    async read(context){const key=await contextKey(context);return transaction("readonly",async tx=>{
      const alias=await request<Alias|undefined>(tx.objectStore("aliases").get(key));if(!alias)return null;
      const record=await request<unknown>(tx.objectStore("records").get(alias.localId));
      if(!record)throw new DraftStorageError("storage-invalid");return parseStoredCheckpoint(record);
    });},
    async writeWorking(input,expected,qrFile){
      const form=sanitizeDraftForm(input.form), alias=input.remote?await contextKey({kind:"edit",editToken:input.remote.editToken}):"new";
      return transaction("readwrite",async tx=>{
        const records=tx.objectStore("records"),aliases=tx.objectStore("aliases"),assets=tx.objectStore("qrAssets");
        let previous:Checkpoint|undefined;
        if(expected===null){
          if(await request(records.get(input.localId)))return conflict();
          const owner=await request<Alias|undefined>(aliases.get(alias));
          if(owner&&owner.localId!==input.localId){
            const receipt=parseStoredCheckpoint(await request(records.get(owner.localId)));
            // A published bill may be edited again without erasing its creation receipt.
            if(!input.remote||input.remote.status!=="published"||receipt.kind!=="complete"||receipt.billId!==input.remote.id||new URL(receipt.editUrl).pathname!=="/edit/"+encodeURIComponent(input.remote.editToken))return conflict();
          }
          await request(aliases.put({localId:input.localId},alias));
        }else previous=await current(tx,input.localId,expected);
        if(previous?.kind==="complete")return conflict();
        if(input.qr.kind==="local"){
          const key=[input.localId,input.qr.selectionId];
          const existing=await request<Asset|undefined>(assets.get(key));
          if(!existing){
            if(!qrFile||qrFile.type!==input.qr.contentType||qrFile.size!==input.qr.size||qrFile.size>5*1024*1024)throw new DraftStorageError("storage-invalid");
            await request(assets.put({localId:input.localId,selectionId:input.qr.selectionId,blob:qrFile.slice(0,qrFile.size,qrFile.type),name:input.qr.name,type:qrFile.type} satisfies Asset,key));
          }
        }
        if(previous?.kind==="working"&&previous.qr.kind==="local"&&(input.qr.kind!=="local"||input.qr.selectionId!==previous.qr.selectionId))await request(assets.delete([input.localId,previous.qr.selectionId]));
        const record=parseStoredCheckpoint({...input,form,localVersion:(expected??-1)+1,savedAt:Date.now()});
        if(record.kind!=="working")throw new DraftStorageError("storage-invalid");
        await request(records.put(record,record.localId));return record;
      });
    },
    async loadQr(localId,selectionId){return transaction("readonly",async tx=>{
      const asset=await request<Asset|undefined>(tx.objectStore("qrAssets").get([localId,selectionId]));
      return asset?new File([asset.blob],asset.name,{type:asset.type}):null;
    });},
    async bindEditContext(localId,editToken,expected){const key=await contextKey({kind:"edit",editToken});return transaction("readwrite",async tx=>{
      const record=await current(tx,localId,expected);if(record.kind!=="working")return conflict();
      const aliases=tx.objectStore("aliases"),owner=await request<Alias|undefined>(aliases.get(key));
      if(owner&&owner.localId!==localId)return conflict();
      const updated={...record,localVersion:record.localVersion+1};
      await request(aliases.put({localId},key));await request(tx.objectStore("records").put(updated,localId));return updated;
    });},
    async writeCompletion(input,expected){return transaction("readwrite",async tx=>{
      await current(tx,input.localId,expected);
      const record=parseStoredCheckpoint({...input,localVersion:expected+1,savedAt:Date.now()});if(record.kind!=="complete")throw new DraftStorageError("storage-invalid");
      await removeAssets(tx,input.localId);await request(tx.objectStore("records").put(record,input.localId));return record;
    });},
    async startNew(previousId){return transaction("readwrite",async tx=>{
      const aliases=tx.objectStore("aliases"),records=tx.objectStore("records"),owner=await request<Alias|undefined>(aliases.get("new"));
      if(owner&&owner.localId!==previousId)return conflict();
      if(owner){
        const old=await request<Checkpoint|undefined>(records.get(owner.localId));
        const keys=await request(aliases.index("localId").getAllKeys(owner.localId));
        if(keys.some(key=>key!=="new")){if(old)await request(records.put({...old,localVersion:old.localVersion+1},old.localId));}
        else{await removeAssets(tx,owner.localId);await request(records.delete(owner.localId));}
      }
      const record:WorkingCheckpoint={kind:"working",schemaVersion:1,localId:crypto.randomUUID(),localVersion:0,formSequence:0,form:sanitizeDraftForm(makeBlankForm()),qr:{kind:"none"},savedAt:Date.now()};
      await request(records.put(record,record.localId));await request(aliases.put({localId:record.localId},"new"));return record;
    });},
  };
}
