"use client";
import {useEffect,useRef,useState} from "react";
import type {BillDocument} from "./types";
import {createOpaqueToken} from "./tokens";
import {createDraftApi,DraftApiError,type DraftApi} from "./draft-api";
import {openDraftStore,DraftStorageError,type DraftStore} from "./draft-store";
import {createDraftSaveQueue,type DraftSaveQueue} from "./draft-save-queue";
import {comparableForm,recoveredQrUpload,sameQr} from "./draft-ack";
import {formFromDocument,hasMeaningfulDraft,makeBlankForm,sanitizeDraftForm,type Checkpoint,type CompletionCheckpoint,type DraftAck,type DraftForm,type QrSelection,type RemoteIdentity,type SaveState,type WorkingCheckpoint} from "./draft-state";

export type SubmissionContext={form:DraftForm;remote:RemoteIdentity;qr:QrSelection;confirmationId:string;generation:string;localId:string;localVersion:number};
type View={form:DraftForm;qr:QrSelection;phase:"hydrating"|"recovery"|"editing"|"submitting"|"complete";recovery:WorkingCheckpoint|null;completion:CompletionCheckpoint|null;localSave:SaveState;remoteSave:SaveState;remote?:RemoteIdentity};
export type DraftSession=View & {
  setForm(updater:(form:DraftForm)=>DraftForm):void;selectQr(file:File):Promise<void>;
  resume():Promise<void>;startFresh():Promise<void>;retrySave():void;loadLatest():Promise<void>;
  ensureRemote():Promise<RemoteIdentity>;prepareSubmission():Promise<SubmissionContext>;
  rememberRemote(remote:RemoteIdentity):Promise<void>;completeSubmission(receipt:CompletionCheckpoint):Promise<void>;
  completePublishedUpdate(document:BillDocument,remote:RemoteIdentity):Promise<void>;
  failSubmission(error?:unknown):void;beginNew():Promise<void>;
};
type Options={initialDocument?:BillDocument;initialSnapshot?:DraftAck;editToken?:string;dependencies?:{store:DraftStore;api:DraftApi}};
const blankView=():View=>({form:makeBlankForm(),qr:{kind:"none"},phase:"hydrating",recovery:null,completion:null,localSave:{status:"idle"},remoteSave:{status:"idle"}});
const stale=()=>new DOMException("Session changed","AbortError");
const errorState=(error:unknown):SaveState=>({status:error instanceof DraftStorageError&&error.code==="storage-conflict"||error instanceof DraftApiError&&error.status===409?"conflict":"error",code:error instanceof DraftStorageError||error instanceof DraftApiError?error.code:"storage-unavailable"});

function createSession(options:Options,emit:(view:View)=>void){
  let view=blankView(),alive=true,generation=crypto.randomUUID(),record:WorkingCheckpoint|undefined,exists=false,boundToken:string|undefined;
  let tail:Promise<void>=Promise.resolve(),creation:Promise<RemoteIdentity>|undefined,queue:DraftSaveQueue|undefined,serverSnapshot:DraftAck|undefined;
  const api=options.dependencies?.api??createDraftApi();
  const storePromise=options.dependencies?Promise.resolve(options.dependencies.store):openDraftStore();void storePromise.catch(()=>undefined);
  const update=(patch:Partial<View>)=>{if(alive){view={...view,...patch};emit(view);}};
  const guard=(id:string)=>{if(!alive||id!==generation)throw stale();};
  const newRecord=(form:DraftForm,remote?:RemoteIdentity):WorkingCheckpoint=>({kind:"working",schemaVersion:1,localId:crypto.randomUUID(),localVersion:0,formSequence:0,form:sanitizeDraftForm(form),qr:{kind:form.draft.recipient?.qr?"server":"none"},remote,savedAt:Date.now()});
  const storedQr=(qr:QrSelection):WorkingCheckpoint["qr"]=>qr.kind==="local"?{kind:"local",selectionId:qr.selectionId,name:qr.file.name,contentType:qr.file.type as "image/png"|"image/jpeg"|"image/webp",size:qr.file.size}:qr;
  function persist():Promise<void>{
    if(!record)return Promise.resolve();
    const id=generation,snapshot={...record,form:sanitizeDraftForm(view.form),remote:view.remote,qr:storedQr(view.qr)},file=view.qr.kind==="local"?view.qr.file:undefined;
    update({localSave:{status:"saving"}});
    const write=tail.catch(()=>undefined).then(async()=>{
      guard(id);const store=await storePromise;guard(id);
      const committed=await store.writeWorking(snapshot,exists?record!.localVersion:null,file);guard(id);
      exists=true;record={...record!,localVersion:committed.localVersion};
      if(snapshot.remote&&boundToken!==snapshot.remote.editToken){
        const bound=await store.bindEditContext(record.localId,snapshot.remote.editToken,record.localVersion);guard(id);
        record={...record,localVersion:bound.localVersion};boundToken=snapshot.remote.editToken;
      }
      if(tail===write)update({localSave:{status:"saved",savedAt:committed.savedAt}});
    }).catch(error=>{if(alive&&id===generation)update({localSave:errorState(error)});throw error;});
    tail=write;void write.catch(()=>undefined);return write;
  }
  async function rememberRemote(remote:RemoteIdentity){update({remote});if(record)record={...record,remote};await persist();}
  function setupQueue(){
    queue?.stop();queue=undefined;if(view.remote?.status!=="draft")return;
    const id=generation;
    queue=createDraftSaveQueue({onState:remoteSave=>{if(alive&&id===generation)update({remoteSave});},save:async(form,signal)=>{
      guard(id);let remote=view.remote!;
      const qr=view.qr;
      if(qr.kind==="local"&&qr.selectionId!==remote.qrSelectionId){
        const before=serverSnapshot;let ack:DraftAck;
        try{ack=await api.uploadQr(remote.editToken,remote.revision,qr.file,"draft",signal,qr.selectionId);}catch(error){
          guard(id);if(!(error instanceof DraftApiError&&error.status===0)||!before)throw error;
          const latest=await api.load(remote.editToken,signal);guard(id);if(!recoveredQrUpload(before,latest,qr.selectionId))throw new DraftApiError(409,"revision-conflict");ack=latest;
        }
        guard(id);serverSnapshot=ack;
        remote={...remote,revision:ack.revision,qrSelectionId:qr.selectionId};update({remote});if(record)record={...record,remote};
      }
      let ack:DraftAck;
      try{ack=await api.save(remote.editToken,remote.revision,form,signal);}catch(error){
        guard(id);
        // A lost response can be acknowledged only if the exact safe form is present.
        if(error instanceof DraftApiError&&error.status===0){
          const latest=await api.load(remote.editToken,signal);guard(id);
          if(latest.document.status!=="draft"||!latest.form||comparableForm(latest.form)!==comparableForm(form)||!serverSnapshot||!sameQr(serverSnapshot,latest))throw new DraftApiError(409,"revision-conflict");
          ack=latest;
        }else throw error;
      }
      guard(id);serverSnapshot=ack;update({remote:{...remote,revision:ack.revision}});if(record)record={...record,remote:view.remote,serverSavedAt:Date.now()};
      await persist().catch(()=>undefined);
    }});return queue;
  }
  const enqueue=()=>{if(view.remote?.status==="draft")queue?.enqueue(sanitizeDraftForm(view.form));};
  function setForm(updater:(form:DraftForm)=>DraftForm){
    if(view.phase!=="editing"||!record)return;
    update({form:updater(view.form)});record={...record,formSequence:record.formSequence+1,pendingConfirmation:undefined};
    void persist().catch(()=>undefined);enqueue();
  }
  async function selectQr(file:File){
    if(view.phase!=="editing"||!record)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>5*1024*1024)throw new DraftStorageError("storage-invalid");
    update({qr:{kind:"local",selectionId:crypto.randomUUID(),file}});record={...record,formSequence:record.formSequence+1,pendingConfirmation:undefined};
    await persist().catch(()=>undefined);enqueue();
  }
  async function activate(saved:WorkingCheckpoint){
    const id=generation;record=saved;exists=true;boundToken=saved.remote?.editToken;
    let qr:QrSelection=saved.qr.kind==="server"?{kind:"server"}:{kind:"none"};
    if(saved.qr.kind==="local"){
      const file=await (await storePromise).loadQr(saved.localId,saved.qr.selectionId);guard(id);
      if(file)qr={kind:"local",selectionId:saved.qr.selectionId,file};else update({localSave:{status:"error",code:"missing-qr"}});
    }
    update({form:saved.form,qr,remote:saved.remote,recovery:null,phase:"hydrating",localSave:{status:"saved",savedAt:saved.savedAt}});
  }
  const identity=(ack:DraftAck,token:string,previous?:RemoteIdentity):RemoteIdentity=>{if(ack.document.status==="deleted")throw new DraftApiError(404,"not-found");return {...previous,id:ack.id,editToken:token,revision:ack.revision,status:ack.document.status};};
  async function restoreReceipt(saved:WorkingCheckpoint,ack:DraftAck){
    if(ack.document.status!=="published"||!saved.pendingConfirmation||ack.lastConfirmationId!==saved.pendingConfirmation.id||!saved.remote?.shareToken)return false;
    const origin=globalThis.location?.origin??"https://harn-tee.zleeppy.chatgpt.site";
    record=saved;exists=true;update({remote:identity(ack,saved.remote.editToken,saved.remote)});
    await completeSubmission({kind:"complete",schemaVersion:1,localId:saved.localId,localVersion:saved.localVersion,billId:ack.id,shareUrl:origin+"/share/"+saved.remote.shareToken,editUrl:origin+"/edit/"+saved.remote.editToken,savedAt:Date.now()});return true;
  }
  async function resume(){
    const saved=view.recovery;if(!saved)return;const id=generation;
    await activate(saved);guard(id);
    if(saved.remote){
      try{
        const ack=await api.load(saved.remote.editToken);guard(id);
        serverSnapshot=ack;
        if(await restoreReceipt(saved,ack))return;
        if(ack.revision!==saved.remote.revision){queue?.stop();update({phase:"editing",remoteSave:{status:"conflict",code:"revision-conflict"}});return;}
      }catch(error){guard(id);update({phase:"editing",remoteSave:errorState(error)});return;}
    }
    update({phase:"editing"});setupQueue();enqueue();
  }
  async function hydrate(){
    const id=generation;let saved:Checkpoint|null=null,ack=options.initialSnapshot;
    try{saved=await (await storePromise).read(options.editToken?{kind:"edit",editToken:options.editToken}:{kind:"new"});}catch(error){guard(id);update({localSave:errorState(error)});}
    guard(id);
    if(options.editToken){
      try{ack=await api.load(options.editToken);guard(id);}catch(error){guard(id);update({remoteSave:errorState(error)});if(!ack&&!saved)return;}
    }
    if(saved?.kind==="complete"&&!options.editToken){update({phase:"complete",completion:saved});return;}
    if(saved?.kind==="working"&&(saved.formSequence>0||hasMeaningfulDraft(saved.form))){
      if(ack&&await restoreReceipt(saved,ack))return;
      // Clean published baselines are loaded from the server without a recovery prompt.
      if(!(saved.remote?.status==="published"&&saved.formSequence===0)){
        record=saved;exists=true;update({phase:"recovery",recovery:saved});return;
      }
    }
    serverSnapshot=ack;const form=ack?(ack.form??formFromDocument(ack.document)):options.initialDocument?formFromDocument(options.initialDocument):makeBlankForm();
    const remote=ack&&options.editToken?identity(ack,options.editToken,saved?.kind==="working"?saved.remote:undefined):undefined;
    if(saved?.kind==="working"){record=saved;exists=true;boundToken=saved.remote?.editToken;}else{record=newRecord(form,remote);exists=false;}
    update({form,remote,qr:{kind:form.draft.recipient?.qr?"server":"none"},phase:"editing"});setupQueue();
    await persist().catch(()=>undefined);
  }
  async function ensureRemote():Promise<RemoteIdentity>{
    if(view.remote)return view.remote;if(creation)return creation;
    const id=generation;
    creation=(async()=>{
      if(!record)throw new Error("not-ready");record={...record,creationKey:record.creationKey??createOpaqueToken()};
      await persist().catch(()=>undefined);guard(id);
      const ack=await api.create(record.creationKey!,sanitizeDraftForm(view.form));guard(id);
      serverSnapshot=ack;
      const remote:RemoteIdentity={...identity(ack,ack.editToken),shareToken:ack.shareToken};
      update({remote});record={...record,remote};await persist().catch(()=>undefined);guard(id);setupQueue();enqueue();return remote;
    })().finally(()=>{if(id===generation)creation=undefined;});return creation;
  }
  async function prepareSubmission():Promise<SubmissionContext>{
    if(view.phase!=="editing")throw new Error("not-ready");const id=generation;update({phase:"submitting"});
    try{
      await ensureRemote();guard(id);await queue?.flush();guard(id);queue?.stop();
      if(view.remoteSave.status==="conflict"||view.localSave.status==="conflict")throw new DraftApiError(409,"revision-conflict");
      record={...record!,pendingConfirmation:record!.pendingConfirmation?.formSequence===record!.formSequence?record!.pendingConfirmation:{id:createOpaqueToken(),formSequence:record!.formSequence}};
      await persist().catch(()=>undefined);guard(id);
      return {form:view.form,remote:view.remote!,qr:view.qr,confirmationId:record.pendingConfirmation!.id,generation:id,localId:record.localId,localVersion:record.localVersion};
    }catch(error){guard(id);update({phase:"editing"});throw error;}
  }
  async function completeSubmission(receipt:CompletionCheckpoint){
    const id=generation;queue?.stop();await tail.catch(()=>undefined);guard(id);
    const completed={...receipt,localId:record?.localId??receipt.localId,localVersion:record?.localVersion??receipt.localVersion};
    // The server has already published; keep the success links visible even if local storage fails.
    update({phase:"complete",completion:completed,recovery:null});
    try{const committed=await (await storePromise).writeCompletion(completed,record!.localVersion);guard(id);update({completion:committed,localSave:{status:"saved",savedAt:committed.savedAt}});}catch(error){guard(id);update({localSave:errorState(error)});}
  }
  async function reset(){
    const previous=record?.localId??view.completion?.localId;generation=crypto.randomUUID();queue?.stop();creation=undefined;await tail.catch(()=>undefined);tail=Promise.resolve();
    record=undefined;exists=false;boundToken=undefined;serverSnapshot=undefined;view=blankView();emit(view);
    try{
      const store=await storePromise,root=options.editToken?await store.read({kind:"new"}):undefined;
      if(root?.kind==="working"&&root.localId!==previous&&hasMeaningfulDraft(root.form)){
        record=root;exists=true;update({phase:"recovery",recovery:root});return;
      }
      const fresh=await store.startNew(options.editToken?root?.localId:previous);record=fresh;exists=true;update({form:fresh.form,phase:"editing",localSave:{status:"saved",savedAt:fresh.savedAt}});
    }catch(error){record=newRecord(makeBlankForm());update({form:record.form,phase:"editing",localSave:errorState(error)});}
  }
  async function loadLatest(){
    if(view.localSave.status==="conflict"||!view.remote&&!options.editToken){
      const id=generation;queue?.stop();await tail.catch(()=>undefined);
      const saved=await (await storePromise).read(options.editToken?{kind:"edit",editToken:options.editToken}:{kind:"new"});guard(id);
      if(saved?.kind==="complete"){update({phase:"complete",completion:saved,recovery:null,remote:undefined,localSave:{status:"saved",savedAt:saved.savedAt}});return;}
      if(saved?.kind==="working"){update({recovery:saved});await resume();return;}
      throw new DraftStorageError("storage-conflict");
    }
    if(!view.remote&&!options.editToken)return;const id=generation,token=view.remote?.editToken??options.editToken!;queue?.stop();
    const ack=await api.load(token);guard(id);serverSnapshot=ack;const form=ack.form??formFromDocument(ack.document);
    update({form,remote:identity(ack,token,view.remote),qr:{kind:ack.document.recipient.qr?"server":"none"},phase:"editing",recovery:null,remoteSave:{status:"saved",savedAt:Date.now()}});
    record={...(record??newRecord(form,view.remote)),formSequence:0,pendingConfirmation:undefined};await persist().catch(()=>undefined);setupQueue();
  }
  async function completePublishedUpdate(document:BillDocument,remote:RemoteIdentity){
    queue?.stop();update({form:{...formFromDocument(document),step:view.form.step},remote,qr:{kind:document.recipient.qr?"server":"none"},phase:"editing"});
    record={...record!,formSequence:0,pendingConfirmation:undefined};await persist().catch(()=>undefined);
  }
  const flush=()=>{if(view.phase==="editing"){void tail.catch(()=>undefined);void queue?.flush().catch(()=>undefined);}};
  async function retryRemote(){
    if(queue){queue.retry();return;}
    if(view.remote?.status!=="draft"||view.remoteSave.status!=="error")return;
    const id=generation,remote=view.remote;
    try{const ack=await api.load(remote.editToken);guard(id);if(ack.revision!==remote.revision)throw new DraftApiError(409,"revision-conflict");serverSnapshot=ack;const freshQueue=setupQueue();enqueue();freshQueue?.retry();}catch(error){if(alive&&id===generation)update({remoteSave:errorState(error)});}
  }
  const online=()=>{void retryRemote();};
  return {hydrate,dispose(){alive=false;queue?.stop();if(!options.dependencies)void storePromise.then(store=>store.close()).catch(()=>undefined);},
    setForm,selectQr,resume,startFresh:reset,beginNew:reset,ensureRemote,prepareSubmission,rememberRemote,completeSubmission,completePublishedUpdate,
    failSubmission(error?:unknown){if(error instanceof DraftApiError&&error.status===409){queue?.stop();queue=undefined;update({phase:"editing",remoteSave:errorState(error)});}else if(view.phase==="submitting"){update({phase:"editing"});setupQueue();}},
    retrySave(){void persist().catch(()=>undefined);void retryRemote();},loadLatest,flush,online};
}

export function useDraftSession(options:Options={}):DraftSession{
  const [view,setView]=useState<View>(blankView),controller=useRef<ReturnType<typeof createSession>|null>(null);
  useEffect(()=>{
    const current=createSession(options,setView);controller.current=current;
    void current.hydrate().catch(()=>undefined);
    window.addEventListener("online",current.online);window.addEventListener("pagehide",current.flush);
    const visibility=()=>{if(document.visibilityState==="hidden")current.flush();};document.addEventListener("visibilitychange",visibility);
    return ()=>{current.dispose();window.removeEventListener("online",current.online);window.removeEventListener("pagehide",current.flush);document.removeEventListener("visibilitychange",visibility);};
    // Entry props are immutable for a route; changing capability starts a separate session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[options.editToken]);
  const c=()=>{if(!controller.current)throw new Error("not-ready");return controller.current;};
  return {...view,setForm:u=>c().setForm(u),selectQr:f=>c().selectQr(f),resume:()=>c().resume(),startFresh:()=>c().startFresh(),beginNew:()=>c().beginNew(),retrySave:()=>c().retrySave(),loadLatest:()=>c().loadLatest(),ensureRemote:()=>c().ensureRemote(),prepareSubmission:()=>c().prepareSubmission(),rememberRemote:r=>c().rememberRemote(r),completeSubmission:r=>c().completeSubmission(r),completePublishedUpdate:(d,r)=>c().completePublishedUpdate(d,r),failSubmission:e=>c().failSubmission(e)};
}
