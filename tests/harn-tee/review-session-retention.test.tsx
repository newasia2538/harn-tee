// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {act,cleanup,renderHook,waitFor} from "@testing-library/react";
import {IDBFactory} from "fake-indexeddb";
import {openDraftStore} from "../../lib/harn-tee/draft-store";
import {useDraftSession} from "../../lib/harn-tee/use-draft-session";
import {createHistorySync} from "../../lib/harn-tee/history-sync";
import {createRetentionClock} from "../../lib/harn-tee/retention-clock";
import {DraftApiError} from "../../lib/harn-tee/draft-api";
import {safeFixture} from "../helpers/draft-fixtures";
import {sessionFixtures} from "../helpers/draft-session-fixtures";
afterEach(()=>{cleanup();vi.useRealTimers();});
it("keeps_the_renewed_local_deadline_after_resuming_editing_and_failed_offline_creation",async()=>{
 vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(100000);const store=await openDraftStore(new IDBFactory());let initial=await store.startNew();initial=await store.writeWorking({...initial,form:safeFixture()},initial.localVersion);const original=initial.lifecycle!.expiresAt;
 vi.setSystemTime(original-1000);const fx=sessionFixtures();vi.mocked(fx.api.create).mockRejectedValue(new DraftApiError(0,"network"));const {result,unmount}=renderHook(()=>useDraftSession({localId:initial.localId,dependencies:{store,api:fx.api}}));await waitFor(()=>expect(result.current.phase).toBe("recovery"));await act(()=>result.current.resume());
 act(()=>result.current.setForm(f=>({...f,draft:{...f.draft,title:"recent edit"}})));await waitFor(()=>expect(result.current.localSave.status).toBe("saved"));const renewed=(await store.history.list())[0];expect(renewed.kind==="bill"&&renewed.lifecycle.expiresAt).toBeGreaterThan(original);
 await act(async()=>{await expect(result.current.ensureRemote()).rejects.toMatchObject({code:"network"});});expect((await store.history.list())[0]).toMatchObject({lifecycle:renewed.kind==="bill"?renewed.lifecycle:{}});
 vi.setSystemTime(original);const sync=createHistorySync({store:store.history,api:{sync:vi.fn(async()=>({serverNow:Date.now(),items:[]})),maintain:vi.fn(async()=>({serverNow:Date.now()})),remove:vi.fn()},clock:createRetentionClock(()=>0)});await sync.refresh("manual");expect(await store.read({kind:"local",localId:initial.localId})).not.toBeNull();sync.dispose();unmount();store.close();
});
