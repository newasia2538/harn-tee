import {afterEach,expect,it,vi} from "vitest";
import {IDBFactory,IDBObjectStore} from "fake-indexeddb";
import {openDraftStore} from "../../lib/harn-tee/draft-store";
import {makeBlankForm,sanitizeDraftForm,setNumericInput,type WorkingCheckpoint} from "../../lib/harn-tee/draft-state";
import {safeFixture} from "../helpers/draft-fixtures";
const request=<T,>(r:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
async function oldDatabase(factory:IDBFactory){
 const open=factory.open("harn-tee-drafts",1);open.onupgradeneeded=()=>{const db=open.result;db.createObjectStore("records");db.createObjectStore("aliases").createIndex("localId","localId");db.createObjectStore("qrAssets").createIndex("localId","localId");};return request(open);
}
const oldRecord=(id:string):WorkingCheckpoint=>({kind:"working",schemaVersion:1,localId:id,localVersion:0,formSequence:0,form:safeFixture(),qr:{kind:"none"},savedAt:1});
it("upgrades_v1_preserving_owned_data_and_granting_local_grace_once",async()=>{
 vi.spyOn(Date,"now").mockReturnValue(100000);const factory=new IDBFactory(),db=await oldDatabase(factory);
 const tx=db.transaction(["records","aliases","qrAssets"],"readwrite");
 await request(tx.objectStore("records").put({...oldRecord("mine"),qr:{kind:"local",selectionId:"q",name:"qr.png",contentType:"image/png",size:2}},"mine"));
 await request(tx.objectStore("aliases").put({localId:"mine"},"new"));
 await request(tx.objectStore("qrAssets").put({localId:"mine",selectionId:"q",blob:new Blob(["qr"],{type:"image/png"}),name:"qr.png",type:"image/png"},["mine","q"]));
 await request(tx.objectStore("records").put({...oldRecord("visitor"),remote:{id:"other",editToken:"other-edit",revision:"r",status:"published"}},"visitor"));
 await request(tx.objectStore("aliases").put({localId:"visitor"},"edit:other"));db.close();
 const store=await openDraftStore(factory);const entries=await store.history.list();expect(entries).toHaveLength(1);expect(entries[0]).toMatchObject({kind:"bill",localId:"mine",lifecycle:{expiresAt:2592100000}});
 expect(await (await store.loadQr("mine","q"))!.text()).toBe("qr");expect(await store.read({kind:"local",localId:"mine"})).toMatchObject({provenance:"created-here"});store.close();
 vi.mocked(Date.now).mockReturnValue(200000);const reopened=await openDraftStore(factory);expect((await reopened.history.list())[0]).toMatchObject({lifecycle:{expiresAt:2592100000}});reopened.close();vi.restoreAllMocks();
});
it("archives_meaningful_drafts_and_never_renews_on_step_or_noop",async()=>{
 vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(100000);const store=await openDraftStore(new IDBFactory());let a=await store.startNew();expect(await store.history.list()).toEqual([]);
 a=await store.writeWorking({...a,form:sanitizeDraftForm(setNumericInput(makeBlankForm(),{kind:"vat"},"7."))},a.localVersion);
 const original=(await store.history.list())[0];vi.setSystemTime(200000);
 a=await store.writeWorking({...a,form:{...a.form,step:1}},a.localVersion);expect((await store.history.list())[0]).toMatchObject({lifecycle:original.kind==="bill"?original.lifecycle:{}});
 const b=await store.startNew(a.localId);expect((await store.read({kind:"local",localId:a.localId}))?.localId).toBe(a.localId);expect((await store.read({kind:"new"}))?.localId).toBe(b.localId);
 await expect(store.writeWorking(a,a.localVersion)).rejects.toThrow(/conflict/);store.close();
});
it("purges_only_owned_records_and_prevents_stale_autosave_or_completion",async()=>{
 const store=await openDraftStore(new IDBFactory());let a=await store.startNew();const file=new File(["qr"],"qr.png",{type:"image/png"});
 a=await store.writeWorking({...a,form:safeFixture(),qr:{kind:"local",selectionId:"q",name:file.name,contentType:"image/png",size:file.size}},a.localVersion,file);
 const b=await store.startNew(a.localId);const entry=(await store.history.list())[0];
 await expect(store.history.purge(entry.localId,entry.localVersion+1)).rejects.toThrow(/conflict/);expect(await store.loadQr(a.localId,"q")).not.toBeNull();
 await store.history.purge(entry.localId,entry.localVersion);expect(await store.loadQr(a.localId,"q")).toBeNull();expect(await store.read({kind:"new"})).toMatchObject({localId:b.localId});
 await expect(store.writeWorking(a,a.localVersion)).rejects.toThrow(/conflict/);
 await expect(store.writeCompletion({kind:"complete",schemaVersion:1,localId:a.localId,localVersion:a.localVersion,billId:"b",shareUrl:"https://test/share/s",editUrl:"https://test/edit/e",savedAt:1},a.localVersion)).rejects.toThrow(/conflict/);store.close();
});
it("keeps_offline_delete_work_then_minimizes_after_confirmed_revocation",async()=>{
 const store=await openDraftStore(new IDBFactory());let a=await store.startNew();a=await store.writeWorking({...a,form:safeFixture(),remote:{id:"bill",editToken:"e",shareToken:"s",revision:"r",status:"draft"},creationKey:"key"},a.localVersion);
 const entry=(await store.history.list())[0];expect(JSON.stringify(entry)).not.toMatch(/1234567890|recipient|qr|items|accountNumber/);
 const pending=await store.history.markPendingDelete(entry.localId,entry.localVersion,"r");expect(await store.read({kind:"local",localId:a.localId})).not.toBeNull();await expect(store.writeWorking(a,a.localVersion)).rejects.toThrow(/conflict/);
 const minimal=await store.history.confirmRevocation(entry.localId,pending.localVersion,{state:"deleting",serverNow:100});expect(minimal).toMatchObject({kind:"deleting",editToken:"e",revision:"r"});expect(minimal).not.toHaveProperty("title");expect(minimal).not.toHaveProperty("shareToken");expect(await store.read({kind:"local",localId:a.localId})).toBeNull();
 await store.history.confirmRevocation(entry.localId,minimal!.localVersion,{state:"deleted",serverNow:200});expect(await store.history.list()).toEqual([]);store.close();
});
it("enrolls_qr_only_and_raw_item_fee_but_not_blank_or_step_only",async()=>{
 const store=await openDraftStore(new IDBFactory());let a=await store.startNew();a=await store.writeWorking({...a,form:{...a.form,step:2}},a.localVersion);expect(await store.history.list()).toEqual([]);
 const file=new File(["qr"],"qr.png",{type:"image/png"});a=await store.writeWorking({...a,qr:{kind:"local",selectionId:"q",name:file.name,contentType:"image/png",size:2}},a.localVersion,file);expect(await store.history.list()).toHaveLength(1);
 let b=await store.startNew(a.localId);b=await store.writeWorking({...b,form:sanitizeDraftForm(setNumericInput(b.form,{kind:"item-service",itemId:b.form.draft.items[0].id},"7."))},b.localVersion);expect(await store.history.list()).toHaveLength(2);store.close();
});
it("does_not_enroll_an_unrelated_edit_but_links_same_created_bill_once",async()=>{
 const store=await openDraftStore(new IDBFactory());const a=oldRecord("edit-only");await store.writeWorking({...a,remote:{id:"other",editToken:"e2",revision:"r",status:"draft"}},null);expect(await store.history.list()).toEqual([]);
 let b=await store.startNew();b=await store.writeWorking({...b,form:safeFixture(),creationKey:"c",remote:{id:"mine",editToken:"e",shareToken:"s",revision:"r",status:"published"}},b.localVersion);
 await store.writeCompletion({kind:"complete",schemaVersion:1,localId:b.localId,localVersion:b.localVersion,billId:"mine",shareUrl:"https://test/share/s",editUrl:"https://test/edit/e",savedAt:1},b.localVersion);
 await store.writeWorking({...oldRecord("edit-mine"),remote:{id:"mine",editToken:"e",revision:"r2",status:"published"}},null);
 const entries=await store.history.list();expect(entries).toHaveLength(1);expect(entries[0]).toMatchObject({recordIds:expect.arrayContaining([b.localId,"edit-mine"])});store.close();
});
it("reports_a_blocked_upgrade_without_destroying_v1_data",async()=>{
 const factory=new IDBFactory(),db=await oldDatabase(factory);await expect(openDraftStore(factory)).rejects.toThrow(/storage-unavailable/);db.close();
});
it("migrates_completion_receipts_once_and_excludes_personal_values_from_history",async()=>{
 const factory=new IDBFactory(),db=await oldDatabase(factory),tx=db.transaction(["records","aliases"],"readwrite");
 const complete={kind:"complete",schemaVersion:1,localId:"done",localVersion:1,billId:"b",shareUrl:"https://test/share/s",editUrl:"https://test/edit/e",savedAt:1};
 await request(tx.objectStore("records").put(complete,"done"));await request(tx.objectStore("aliases").put({localId:"done"},"new"));db.close();
 const store=await openDraftStore(factory);expect(await store.read({kind:"new"})).toMatchObject(complete);expect(await store.history.list()).toMatchObject([{billId:"b",editToken:"e",shareToken:"s",deadlineSource:"server",syncState:"pending"}]);
 const b=await store.startNew("done"),form=safeFixture();form.draft.recipient!.promptPay={type:"national-id",value:"1234567890123"};
 await store.writeWorking({...b,form},b.localVersion);store.close();
 const inspect=await request(factory.open("harn-tee-drafts",2));const raw=await request(inspect.transaction(["history","records"]).objectStore("history").getAll());expect(JSON.stringify(raw)).not.toMatch(/1234567890123|1234567890|accountNumber|promptPay|objectKey/);
 const records=await request(inspect.transaction("records").objectStore("records").getAll());expect(JSON.stringify(records)).not.toContain("1234567890123");inspect.close();
});
it("preserves_data_when_a_storage_write_is_denied",async()=>{
 const store=await openDraftStore(new IDBFactory());const a=await store.startNew();
 const denied=vi.spyOn(IDBObjectStore.prototype,"put").mockImplementation(()=>{throw new DOMException("quota","QuotaExceededError");});
 await expect(store.writeWorking({...a,form:safeFixture()},a.localVersion)).rejects.toThrow();denied.mockRestore();
 expect(await store.read({kind:"new"})).toMatchObject({localVersion:a.localVersion,form:a.form});store.close();
});
it("a_stale_checkpoint_cannot_roll_back_a_newer_synced_revision_or_deadline",async()=>{
 const store=await openDraftStore(new IDBFactory());let a=await store.startNew();const life={lastActivityAt:100000,allPaidAt:null,expiresAt:2592100000,paymentStatus:"unpaid" as const,paidCount:0,payerCount:1};
 a=await store.writeWorking({...a,form:safeFixture(),remote:{id:"b",editToken:"e",revision:"A",status:"published",lifecycle:life}},a.localVersion);
 const old=(await store.history.list())[0];if(old.kind!=="bill")throw new Error("fixture");const current=await store.history.upsert({...old,revision:"B",title:"new server title",lifecycle:{...life,paymentStatus:"paid",paidCount:1,allPaidAt:200000,expiresAt:605000000}},old.localVersion);
 await store.writeWorking({...a,form:{...a.form,step:1}},a.localVersion);
 expect((await store.history.list())[0]).toMatchObject({revision:"B",title:"new server title",lifecycle:current.lifecycle});store.close();
});
it("finishing_an_edit_only_draft_never_promotes_it_to_creator_history",async()=>{
 const store=await openDraftStore(new IDBFactory());const a=await store.writeWorking({...oldRecord("visitor"),provenance:"edit-only",remote:{id:"other",editToken:"e",revision:"r",status:"draft"}},null);
 const done=await store.writeCompletion({kind:"complete",schemaVersion:1,localId:a.localId,localVersion:a.localVersion,billId:"other",editUrl:"https://test/edit/e",shareUrl:"https://test/share/s",provenance:"edit-only",savedAt:1},a.localVersion);expect(done.provenance).toBe("edit-only");expect(await store.history.list()).toEqual([]);store.close();
});
it.each([[2,3,"C"],[4,3,"D"]])("orders_real_acknowledgements_against_server_history_versions_%s_%s",async(historyVersion,ackVersion,expectedRevision)=>{
 const store=await openDraftStore(new IDBFactory());let a=await store.startNew();const lifecycle={lastActivityAt:100000,allPaidAt:null,expiresAt:2592100000,paymentStatus:"unpaid" as const,paidCount:0,payerCount:1};a=await store.writeWorking({...a,form:safeFixture(),remote:{id:"b",editToken:"e",revision:"A",status:"published",serverVersion:1,lifecycle}},a.localVersion);const old=(await store.history.list())[0];if(old.kind!=="bill")throw new Error("fixture");await store.history.upsert({...old,revision:historyVersion===2?"B":"D",serverVersion:historyVersion,lifecycle:{...lifecycle,expiresAt:700000000}},old.localVersion);
 await store.writeWorking({...a,remote:{...a.remote!,revision:"C",serverVersion:ackVersion,lifecycle:{...lifecycle,expiresAt:900000000}}},a.localVersion);expect((await store.history.list())[0]).toMatchObject({revision:expectedRevision,lifecycle:{expiresAt:historyVersion===2?900000000:700000000}});store.close();
});
