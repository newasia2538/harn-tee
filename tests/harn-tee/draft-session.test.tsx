// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,renderHook,waitFor} from "@testing-library/react";
import {useDraftSession} from "../../lib/harn-tee/use-draft-session";
import {checkpoint,sessionFixtures} from "../helpers/draft-session-fixtures";
import {setNumericInput} from "../../lib/harn-tee/draft-state";
import {DraftApiError} from "../../lib/harn-tee/draft-api";
import {DraftStorageError} from "../../lib/harn-tee/draft-store";
afterEach(cleanup);
describe("draft recovery session",()=>{
  it("reconciles a committed QR upload when its response is lost",async()=>{
    const fx=sessionFixtures(),original=vi.mocked(fx.api.uploadQr).getMockImplementation()!;
    vi.mocked(fx.api.uploadQr).mockImplementation(async(...args)=>{const ack=await original(...args);fx.setAck({...ack,qrSelectionId:args[5]});throw new DraftApiError(0,"network");});
    const {result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("editing"));await act(()=>result.current.ensureRemote());await act(()=>result.current.selectQr(new File(["qr"],"qr.png",{type:"image/png"})));
    await act(()=>result.current.prepareSubmission());expect(fx.api.uploadQr).toHaveBeenCalledOnce();expect(result.current.remote?.qrSelectionId).toBe(result.current.qr.kind==="local"?result.current.qr.selectionId:"");
  });
  it("reconciles a lost text-save response using equivalent QR metadata",async()=>{
    const fx=sessionFixtures(),original=vi.mocked(fx.api.save).getMockImplementation()!;
    vi.mocked(fx.api.save).mockImplementationOnce(async(...args)=>{const qr=fx.ack.document.recipient.qr;const ack=structuredClone(await original(...args));ack.document.recipient.qr=qr;ack.form!.draft.recipient!.qr=qr;fx.setAck(ack);throw new DraftApiError(0,"network");});
    const {result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("editing"));await act(()=>result.current.ensureRemote());
    await act(()=>result.current.selectQr(new File(["qr"],"qr.png",{type:"image/png"})));
    await act(()=>result.current.prepareSubmission());expect(result.current.remoteSave.status).toBe("saved");
  });
  it("preserves an unrelated unfinished home draft when starting from an edit route",async()=>{
    const fx=sessionFixtures();fx.setAck({...fx.ack,document:{...fx.ack.document,status:"published"},form:undefined});
    vi.mocked(fx.store.read).mockImplementation(async context=>context.kind==="edit"?null:checkpoint());
    const {result}=renderHook(()=>useDraftSession({editToken:"edit",initialSnapshot:fx.ack,dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("editing"));
    await act(()=>result.current.beginNew());expect(fx.store.startNew).not.toHaveBeenCalled();expect(result.current.recovery?.localId).toBe("local");
  });
  it("loads the authoritative local version after a conflict without a remote link",async()=>{
    const saved=checkpoint(),fx=sessionFixtures(saved);const {result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("recovery"));await act(()=>result.current.resume());
    const peer={...saved,localVersion:9,form:{...saved.form,draft:{...saved.form.draft,title:"peer"}}};fx.setStored(peer);
    vi.mocked(fx.store.writeWorking).mockRejectedValueOnce(new DraftStorageError("storage-conflict"));act(()=>result.current.setForm(f=>({...f,draft:{...f.draft,title:"mine"}})));await waitFor(()=>expect(result.current.localSave.status).toBe("conflict"));
    await act(()=>result.current.loadLatest());expect(result.current.form.draft.title).toBe("peer");act(()=>result.current.setForm(f=>({...f,draft:{...f.draft,title:"after reload"}})));await waitFor(()=>expect(result.current.localSave.status).toBe("saved"));
  });
  it("rechecks the revision and resumes autosave after recovering offline",async()=>{
    const saved=checkpoint(),fx=sessionFixtures(saved);saved.remote={id:"b1",editToken:"edit",revision:fx.ack.revision,status:"draft"};vi.mocked(fx.api.load).mockRejectedValueOnce(new DraftApiError(0,"network"));
    const {result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("recovery"));await act(()=>result.current.resume());
    act(()=>result.current.setForm(f=>({...f,draft:{...f.draft,title:"offline edit"}})));act(()=>result.current.retrySave());
    await waitFor(()=>expect(result.current.remoteSave.status).toBe("saved"),{timeout:2000});expect(vi.mocked(fx.api.save).mock.calls.at(-1)?.[2].draft.title).toBe("offline edit");
  });
  it("waits for checkpoint loading and user continuation before writing anything",async()=>{
    const fx=sessionFixtures(),saved=checkpoint();saved.form=setNumericInput(saved.form,{kind:"price",itemId:"i1"},"7.") as typeof saved.form;saved.form.step=1;
    let resolve!:(value:typeof saved)=>void;vi.mocked(fx.store.read).mockReturnValue(new Promise(r=>{resolve=r;}));
    const {result}=renderHook(()=>useDraftSession({dependencies:fx}));
    expect(result.current.phase).toBe("hydrating");expect(fx.store.writeWorking).not.toHaveBeenCalled();
    await act(async()=>{resolve(saved);});await waitFor(()=>expect(result.current.phase).toBe("recovery"));
    expect(fx.store.writeWorking).not.toHaveBeenCalled();
    await act(()=>result.current.resume());
    expect(result.current.form.numbers.prices.i1).toBe("7.");expect(result.current.form.step).toBe(1);
  });
  it("persists safe data without clearing an ID from the active input",async()=>{
    const fx=sessionFixtures(),{result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("editing"));
    act(()=>result.current.setForm(form=>({...form,draft:{...form.draft,recipient:{...form.draft.recipient!,promptPay:{type:"national-id",value:"1234567890123"}}}})));
    await waitFor(()=>expect(result.current.localSave.status).toBe("saved"));
    expect(result.current.form.draft.recipient?.promptPay?.value).toBe("1234567890123");expect(JSON.stringify(fx.stored)).not.toContain("1234567890123");
  });
  it("deduplicates edit-link creation and never transmits a draft ID",async()=>{
    const fx=sessionFixtures(),{result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("editing"));
    let identities:unknown[]=[];await act(async()=>{identities=await Promise.all([result.current.ensureRemote(),result.current.ensureRemote()]);});
    expect(fx.api.create).toHaveBeenCalledTimes(1);expect(identities[0]).toEqual(identities[1]);expect(result.current.remote?.editToken).toBe("edit");
  });
  it("keeps published edits and replacement QR local until explicit confirmation",async()=>{
    const fx=sessionFixtures();fx.setAck({...fx.ack,document:{...fx.ack.document,status:"published"},form:undefined});
    const {result}=renderHook(()=>useDraftSession({editToken:"edit",initialSnapshot:fx.ack,dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("editing"));
    act(()=>result.current.setForm(form=>({...form,draft:{...form.draft,title:"private edit"}})));
    await act(()=>result.current.selectQr(new File(["qr"],"qr.png",{type:"image/png"})));
    await waitFor(()=>expect(result.current.localSave.status).toBe("saved"));
    expect(fx.api.save).not.toHaveBeenCalled();expect(fx.api.uploadQr).not.toHaveBeenCalled();
  });
  it("reports storage failure while preserving the live form",async()=>{
    const fx=sessionFixtures();vi.mocked(fx.store.writeWorking).mockRejectedValue(new Error("quota"));
    const {result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("editing"));
    act(()=>result.current.setForm(form=>({...form,draft:{...form.draft,title:"keep me"}})));
    await waitFor(()=>expect(result.current.localSave.status).toBe("error"));expect(result.current.form.draft.title).toBe("keep me");
  });
  it("ignores a late create response after beginning the next bill",async()=>{
    const fx=sessionFixtures();let resolve!:(value:Awaited<ReturnType<typeof fx.api.create>>)=>void;
    vi.mocked(fx.api.create).mockReturnValue(new Promise(r=>{resolve=r;}));
    const {result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("editing"));
    let pending!:Promise<unknown>;act(()=>{pending=result.current.ensureRemote().catch(error=>error);});
    await waitFor(()=>expect(fx.api.create).toHaveBeenCalled());await act(()=>result.current.beginNew());
    await act(async()=>{resolve({...fx.ack,editToken:"old",shareToken:"old-share"});await pending;});
    expect(result.current.remote).toBeUndefined();expect(result.current.form.draft.title).toBe("");
  });
  it("uploads one selected QR only once across later text saves and submit retries",async()=>{
    const fx=sessionFixtures(),{result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("editing"));
    await act(()=>result.current.ensureRemote());await act(()=>result.current.selectQr(new File(["qr"],"qr.png",{type:"image/png"})));
    await act(()=>result.current.prepareSubmission());act(()=>result.current.failSubmission());await act(()=>result.current.prepareSubmission());
    expect(fx.api.uploadQr).toHaveBeenCalledTimes(1);
  });
  it("keeps form contents when a server conflict blocks publication preparation",async()=>{
    const fx=sessionFixtures(),{result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("editing"));await act(()=>result.current.ensureRemote());
    vi.mocked(fx.api.save).mockRejectedValue(new DraftApiError(409,"revision-conflict"));
    act(()=>result.current.setForm(form=>({...form,draft:{...form.draft,title:"unsent"}})));
    await act(async()=>{await expect(result.current.prepareSubmission()).rejects.toMatchObject({code:"revision-conflict"});});
    expect(result.current.form.draft.title).toBe("unsent");expect(result.current.remoteSave.status).toBe("conflict");
  });
  it("checks the recovered server revision before allowing edits or uploads",async()=>{
    const saved=checkpoint();saved.remote={id:"b1",editToken:"edit",revision:"old",status:"draft"};
    const fx=sessionFixtures(saved);let resolve!:(value:typeof fx.ack)=>void;
    vi.mocked(fx.api.load).mockReturnValue(new Promise(r=>{resolve=r;}));
    const {result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("recovery"));
    let pending!:Promise<void>;act(()=>{pending=result.current.resume();});
    act(()=>result.current.setForm(form=>({...form,draft:{...form.draft,title:"must wait"}})));
    expect(result.current.form.draft.title).not.toBe("must wait");
    await act(async()=>{resolve(fx.ack);await pending;});
    expect(result.current.remoteSave.status).toBe("conflict");expect(fx.api.save).not.toHaveBeenCalled();
  });
  it("restores a lost publication receipt without requesting the excluded ID",async()=>{
    const saved=checkpoint();saved.remote={id:"b1",editToken:"edit",shareToken:"share",revision:"old",status:"draft"};saved.pendingConfirmation={id:"confirm",formSequence:1};
    const fx=sessionFixtures(saved);fx.setAck({...fx.ack,document:{...fx.ack.document,status:"published"},lastConfirmationId:"confirm"});
    const {result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("recovery"));
    await act(()=>result.current.resume());expect(result.current.phase).toBe("complete");expect(result.current.completion?.shareUrl).toContain("/share/share");expect(fx.api.publish).not.toHaveBeenCalled();
  });
});
it("gone_stops_pending_autosave_and_clears_view",async()=>{
 const fx=sessionFixtures(),{result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("editing"));await act(()=>result.current.ensureRemote());vi.mocked(fx.api.save).mockRejectedValue(new DraftApiError(410,"bill-deleting"));
 act(()=>result.current.setForm(f=>({...f,draft:{...f.draft,title:"sensitive"}})));await waitFor(()=>expect(result.current.availability).toBe("deleting"),{timeout:2000});expect(result.current.form.draft.title).toBe("");expect(result.current.remote).toBeUndefined();const count=vi.mocked(fx.api.save).mock.calls.length;act(()=>result.current.retrySave());expect(fx.api.save).toHaveBeenCalledTimes(count);
});
it("history_draft_does_not_replace_home_draft",async()=>{
 const fx=sessionFixtures(checkpoint()),{result}=renderHook(()=>useDraftSession({localId:"local",dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("recovery"));expect(fx.store.read).toHaveBeenCalledWith({kind:"local",localId:"local"});await act(()=>result.current.resume());expect(fx.store.startNew).not.toHaveBeenCalled();
});
it("offline_delete_intent_blocks_edits_without_erasing_the_work",async()=>{
 const saved=checkpoint(),fx=sessionFixtures(saved);vi.mocked(fx.store.history.list).mockResolvedValue([{kind:"bill",schemaVersion:1,localId:saved.localId,recordIds:[saved.localId],title:"bill",totalSatang:100,lifecycle:fx.ack.lifecycle,localVersion:0,deadlineSource:"local",syncState:"offline",shareUsable:false,pendingDelete:{revision:"old",requestedAt:1}}]);
 const {result}=renderHook(()=>useDraftSession({dependencies:fx}));await waitFor(()=>expect(result.current.phase).toBe("recovery"));await act(()=>result.current.resume());const title=result.current.form.draft.title;act(()=>result.current.setForm(f=>({...f,draft:{...f.draft,title:"blocked"}})));expect(result.current.form.draft.title).toBe(title);await expect(result.current.prepareSubmission()).rejects.toThrow();expect(fx.api.create).not.toHaveBeenCalled();
});
