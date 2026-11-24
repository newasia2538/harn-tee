import {afterEach,expect,it,vi} from "vitest";
import {IDBFactory} from "fake-indexeddb";
import {openDraftStore} from "../../lib/harn-tee/draft-store";
import {createHistorySync} from "../../lib/harn-tee/history-sync";
import {createRetentionClock} from "../../lib/harn-tee/retention-clock";
import {DraftApiError} from "../../lib/harn-tee/draft-api";
import type {HistoryApi} from "../../lib/harn-tee/history-api";
import type {ActiveHistoryEntry,HistorySyncResponse} from "../../lib/harn-tee/history-state";
const lifecycle={lastActivityAt:10,allPaidAt:null,expiresAt:9999999999,paymentStatus:"unpaid" as const,paidCount:0,payerCount:2};
const entry=(n=0):ActiveHistoryEntry=>({kind:"bill",schemaVersion:1,localId:"l"+n,recordIds:[],billId:"b"+n,editToken:"e"+n,shareToken:"s"+n,revision:"r",title:"private",totalSatang:100,lifecycle,deadlineSource:"server",localVersion:0,syncState:"synced",shareUsable:true});
function apiFixture(){return {sync:vi.fn<HistoryApi["sync"]>(async entries=>({serverNow:100,items:entries.map(e=>({localId:e.localId,kind:"active",summary:{id:"b"+e.localId.slice(1),title:"remote",totalSatang:200,revision:"r",lifecycle},shareUsable:false}))})),remove:vi.fn<HistoryApi["remove"]>(async()=>({state:"deleted",serverNow:100})),maintain:vi.fn<HistoryApi["maintain"]>(async()=>({serverNow:100}))};}
afterEach(()=>vi.useRealTimers());
it("coalesces_foreground_and_never_polls_per_tick",async()=>{
 vi.useFakeTimers({toFake:["Date","setTimeout","clearTimeout"]});const store=await openDraftStore(new IDBFactory());await store.history.upsert(entry(),null);const api=apiFixture(),sync=createHistorySync({store:store.history,api,clock:createRetentionClock(()=>performance.now())});
 await Promise.all([sync.refresh("entry"),sync.refresh("foreground"),sync.refresh("online")]);expect(api.sync).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(86400000);expect(api.sync).toHaveBeenCalledOnce();sync.dispose();store.close();
});
it("server_deadline_wins_over_local_clock_and_stale_share_preserves_owner_preview",async()=>{
 const store=await openDraftStore(new IDBFactory());await store.history.upsert(entry(),null);const api=apiFixture(),clock=createRetentionClock(()=>0),sync=createHistorySync({store:store.history,api,clock});await sync.refresh("manual");
 expect(clock.now()).toBe(100);expect((await store.history.list())[0]).toMatchObject({lifecycle,shareUsable:false,editToken:"e0"});sync.dispose();store.close();
});
it("older_sync_cannot_overwrite_newer_local_edit",async()=>{
 const store=await openDraftStore(new IDBFactory());const old=await store.history.upsert(entry(),null),api=apiFixture();let resolve!:(r:HistorySyncResponse)=>void;api.sync.mockReturnValue(new Promise(r=>resolve=r));const sync=createHistorySync({store:store.history,api,clock:createRetentionClock(()=>0)}),pending=sync.refresh("manual");
 await vi.waitFor(()=>expect(api.sync).toHaveBeenCalled());await store.history.upsert({...old,title:"new local"},old.localVersion);resolve({serverNow:100,items:[{localId:old.localId,kind:"active",summary:{id:"b0",title:"old remote",totalSatang:2,lifecycle,revision:"old"},shareUsable:true}]});await pending;expect((await store.history.list())[0]).toMatchObject({title:"new local"});sync.dispose();store.close();
});
it("offline_delete_keeps_bound_revision_and_conflict_requires_reconfirmation",async()=>{
 const store=await openDraftStore(new IDBFactory());const old=await store.history.upsert(entry(),null),api=apiFixture();api.remove.mockRejectedValueOnce(new DraftApiError(0,"network")).mockRejectedValueOnce(new DraftApiError(409,"revision-conflict"));const sync=createHistorySync({store:store.history,api,clock:createRetentionClock(()=>0)});
 await sync.remove(old);expect((await store.history.list())[0]).toMatchObject({kind:"bill",title:"private",pendingDelete:{revision:"r"},syncState:"offline"});await sync.refresh("manual");expect(api.remove.mock.calls.map(c=>c[1])).toEqual(["r","r"]);expect((await store.history.list())[0]).toMatchObject({syncState:"conflict"});await sync.refresh("manual");expect(api.remove).toHaveBeenCalledTimes(2);sync.dispose();store.close();
});
it("uses_batches_of_twenty_and_does_not_promote_unknown_records",async()=>{
 const store=await openDraftStore(new IDBFactory());for(let n=0;n<41;n++)await store.history.upsert(entry(n),null);const api=apiFixture(),sync=createHistorySync({store:store.history,api,clock:createRetentionClock(()=>0)});await sync.refresh("manual");expect(api.sync.mock.calls.map(c=>c[0].length)).toEqual([20,20,1]);expect(await store.history.list()).toHaveLength(41);sync.dispose();store.close();
});
it("confirmed_gone_minimizes_work_but_404_keeps_it",async()=>{
 const store=await openDraftStore(new IDBFactory());await store.history.upsert(entry(),null);await store.history.upsert(entry(1),null);const api=apiFixture();api.sync.mockResolvedValue({serverNow:100,items:[{localId:"l0",kind:"gone",state:"deleting"},{localId:"l1",kind:"missing"}]});const sync=createHistorySync({store:store.history,api,clock:createRetentionClock(()=>0)});await sync.refresh("manual");expect(await store.history.list()).toMatchObject([{kind:"deleting",localId:"l0"},{kind:"bill",localId:"l1",title:"private",syncState:"conflict"}]);sync.dispose();store.close();
});
it("gone_legacy_entry_without_a_revision_still_removes_personal_history",async()=>{
 const store=await openDraftStore(new IDBFactory());const old={...entry(),revision:undefined};await store.history.upsert(old,null);const api=apiFixture();api.sync.mockResolvedValue({serverNow:100,items:[{localId:"l0",kind:"gone",state:"deleting"}]});const sync=createHistorySync({store:store.history,api,clock:createRetentionClock(()=>0)});await sync.refresh("manual");expect(await store.history.list()).toMatchObject([{kind:"deleting"}]);expect((await store.history.list())[0]).not.toHaveProperty("title");sync.dispose();store.close();
});
