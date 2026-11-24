import {vi} from "vitest";
import {buildBillDocument} from "../../db/document";
import {makeBlankForm,sanitizeDraftForm,type Checkpoint,type WorkingCheckpoint,type CompletionCheckpoint,type DraftAck,type SafeDraftForm} from "../../lib/harn-tee/draft-state";
import type {DraftStore} from "../../lib/harn-tee/draft-store";
import type {DraftApi} from "../../lib/harn-tee/draft-api";
import {DraftApiError} from "../../lib/harn-tee/draft-api";
import {draftFixture,safeFixture} from "./draft-fixtures";
import {withLifecycle} from "./lifecycle-fixtures";
export function checkpoint():WorkingCheckpoint{return {kind:"working",schemaVersion:1,localId:"local",localVersion:0,formSequence:1,form:safeFixture(),qr:{kind:"none"},savedAt:1};}
export function sessionFixtures(initial:Checkpoint|null=null){
  let stored=initial;const assets=new Map<string,File>();let serial=0;
  const store:DraftStore={
    history:{list:vi.fn(async()=>[]),upsert:vi.fn(async entry=>entry),purge:vi.fn(),markPendingDelete:vi.fn(),confirmRevocation:vi.fn()},
    read:vi.fn(async()=>stored),
    writeWorking:vi.fn(async(record,expected,file)=>{
      if(stored&&stored.localId===record.localId&&stored.localVersion!==expected)throw new Error("storage-conflict");
      stored={...record,form:JSON.parse(JSON.stringify(record.form)),localVersion:(expected??-1)+1,savedAt:Date.now()};
      if(file&&record.qr.kind==="local")assets.set(record.qr.selectionId,file);return stored as WorkingCheckpoint;
    }),
    loadQr:vi.fn(async(_id,selection)=>assets.get(selection)??null),
    bindEditContext:vi.fn(async(_id,_token,version)=>{if(!stored||stored.kind!=="working"||stored.localVersion!==version)throw new Error("storage-conflict");stored={...stored,localVersion:version+1};return stored;}),
    writeCompletion:vi.fn(async(record,version)=>{stored={...record,localVersion:version+1};return stored as CompletionCheckpoint;}),
    startNew:vi.fn(async()=>{stored={...checkpoint(),localId:crypto.randomUUID(),form:sanitizeDraftForm(makeBlankForm()),formSequence:0};return stored as WorkingCheckpoint;}),
    close:vi.fn(),
  };
  let ack:DraftAck=withLifecycle({id:"b1",document:buildBillDocument(draftFixture().draft),form:safeFixture(),revision:"r0"});
  const api:DraftApi={
    create:vi.fn(async(_key,form)=>{ack=withLifecycle({id:"b1",document:buildBillDocument(form.draft),form,revision:`r${++serial}`});return {...ack,editToken:"edit",shareToken:"share"};}),
    load:vi.fn(async()=>ack),
    save:vi.fn(async(_token,revision,form)=>{if(revision!==ack.revision)throw new DraftApiError(409,"revision-conflict");ack=withLifecycle({...ack,form,document:buildBillDocument(form.draft),revision:`r${++serial}`});return ack;}),
    uploadQr:vi.fn(async(_token,revision,file)=>{if(revision!==ack.revision)throw new DraftApiError(409,"revision-conflict");const qr={objectKey:"bills/b1/qr.png",contentType:file.type,size:file.size};ack={...ack,document:{...ack.document,recipient:{...ack.document.recipient,qr}},revision:`r${++serial}`};return ack;}),
    issueShare:vi.fn(async()=>({shareToken:"share",revision:ack.revision})),
    publish:vi.fn(async(_token,revision,form,id)=>{if(revision!==ack.revision)throw new DraftApiError(409,"revision-conflict");ack=withLifecycle({id:"b1",document:buildBillDocument(form.draft,Date.now(),"published"),revision:`r${++serial}`,lastConfirmationId:id});return ack;}),
  };
  return {store,api,get stored(){return stored;},get ack(){return ack;},setAck(next:DraftAck){ack=next;},setStored(next:Checkpoint){stored=next;},safe:(form=makeBlankForm()):SafeDraftForm=>sanitizeDraftForm(form)};
}
