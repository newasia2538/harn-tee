import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { openDraftStore } from "../../lib/harn-tee/draft-store";
import { makeBlankForm, sanitizeDraftForm, setNumericInput } from "../../lib/harn-tee/draft-state";

describe("native draft storage",()=>{
  it("round trips partial fields and owned QR bytes across a reopen",async()=>{
    const factory=new IDBFactory(),store=await openDraftStore(factory);
    const start=await store.startNew();
    const form=setNumericInput({...makeBlankForm(),step:1},{kind:"vat"},"7.");
    const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
    const file=new File([bytes],"qr.png",{type:"image/png"});
    const saved=await store.writeWorking({...start,form:sanitizeDraftForm(form),qr:{kind:"local",selectionId:"qr1",name:file.name,contentType:"image/png",size:file.size}},start.localVersion,file);
    store.close();const reopened=await openDraftStore(factory);
    expect(await reopened.read({kind:"new"})).toMatchObject({form:{step:1,numbers:{vat:"7."}}});
    expect(new Uint8Array(await (await reopened.loadQr(saved.localId,"qr1"))!.arrayBuffer())).toEqual(bytes);
    reopened.close();
  });
  it("rejects stale versions and cannot reclaim the current slot after reset",async()=>{
    const store=await openDraftStore(new IDBFactory());const start=await store.startNew();
    const updated=await store.writeWorking(start,start.localVersion);
    await expect(store.writeWorking(start,start.localVersion)).rejects.toThrow(/conflict/);
    const next=await store.startNew(start.localId);
    await expect(store.writeWorking(updated,updated.localVersion)).rejects.toThrow(/conflict/);
    expect((await store.read({kind:"new"}))?.localId).toBe(next.localId);store.close();
  });
  it("binds the same draft to edit without allowing another draft to take its alias",async()=>{
    const store=await openDraftStore(new IDBFactory());const start=await store.startNew();
    const bound=await store.bindEditContext(start.localId,"edit-key",start.localVersion);
    expect((await store.read({kind:"edit",editToken:"edit-key"}))?.localId).toBe(start.localId);
    const next=await store.startNew(start.localId);
    await expect(store.bindEditContext(next.localId,"edit-key",next.localVersion)).rejects.toThrow(/conflict/);
    expect((await store.read({kind:"edit",editToken:"edit-key"}))?.localId).toBe(bound.localId);store.close();
  });
  it("replaces a completed draft with only recovery links and releases its QR",async()=>{
    const store=await openDraftStore(new IDBFactory());let start=await store.startNew();
    const file=new File(["qr"],"qr.png",{type:"image/png"});
    start=await store.writeWorking({...start,qr:{kind:"local",selectionId:"q",name:file.name,contentType:"image/png",size:file.size}},start.localVersion,file);
    await store.writeCompletion({kind:"complete",schemaVersion:1,localId:start.localId,localVersion:start.localVersion,billId:"b",shareUrl:"https://harn-tee.test/share/s",editUrl:"https://harn-tee.test/edit/e",savedAt:1},start.localVersion);
    const complete=await store.read({kind:"new"});expect(complete?.kind).toBe("complete");expect(complete).not.toHaveProperty("form");
    expect(await store.loadQr(start.localId,"q")).toBeNull();store.close();
  });
  it("rejects a missing QR asset without changing the existing checkpoint",async()=>{
    const store=await openDraftStore(new IDBFactory());const start=await store.startNew();
    await expect(store.writeWorking({...start,qr:{kind:"local",selectionId:"missing",name:"qr.png",contentType:"image/png",size:3}},start.localVersion)).rejects.toThrow();
    expect(await store.read({kind:"new"})).toMatchObject({localVersion:start.localVersion,qr:{kind:"none"}});store.close();
  });
  it("reports an unavailable factory instead of pretending nothing was saved",async()=>{
    await expect(openDraftStore(undefined)).rejects.toThrow();
  });
  it("opens a separate published-edit checkpoint without replacing the creation receipt",async()=>{
    const store=await openDraftStore(new IDBFactory());let start=await store.startNew();
    start=await store.bindEditContext(start.localId,"edit",start.localVersion);
    await store.writeCompletion({kind:"complete",schemaVersion:1,localId:start.localId,localVersion:start.localVersion,billId:"bill",shareUrl:"https://harn-tee.test/share/share",editUrl:"https://harn-tee.test/edit/edit",savedAt:1},start.localVersion);
    const edited=await store.writeWorking({...start,localId:"edit-working",remote:{id:"bill",editToken:"edit",revision:"r",status:"published"}},null);
    expect((await store.read({kind:"edit",editToken:"edit"}))?.localId).toBe(edited.localId);
    expect((await store.read({kind:"new"}))?.kind).toBe("complete");store.close();
  });
});
