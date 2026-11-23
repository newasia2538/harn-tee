import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {createDraftSaveQueue} from "../../lib/harn-tee/draft-save-queue";
import {DraftApiError} from "../../lib/harn-tee/draft-api";
import {safeFixture} from "../helpers/draft-fixtures";
beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
describe("serialized draft saving",()=>{
  it("waits for a pause and coalesces requests behind an in-flight save",async()=>{
    let resolve!:()=>void;const titles:string[]=[];
    const save=vi.fn(async form=>{titles.push(form.draft.title);if(titles.length===1)await new Promise<void>(r=>{resolve=r;});});
    const queue=createDraftSaveQueue({save,onState:vi.fn()});queue.enqueue(safeFixture());
    await vi.advanceTimersByTimeAsync(999);expect(titles).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);expect(titles).toEqual(["ทดสอบดราฟต์"]);
    const second=safeFixture();second.draft.title="discarded";queue.enqueue(second);
    const latest=safeFixture();latest.draft.title="latest";queue.enqueue(latest);
    resolve();await queue.flush();expect(titles).toEqual(["ทดสอบดราฟต์","latest"]);queue.stop();
  });
  it("bounds continuous typing to five seconds",async()=>{
    const titles:string[]=[];const queue=createDraftSaveQueue({save:async form=>{titles.push(form.draft.title!);},onState:vi.fn()});
    for(let i=0;i<10;i++){queue.enqueue(safeFixture());await vi.advanceTimersByTimeAsync(500);}
    expect(titles.length).toBe(1);queue.stop();
  });
  it("does not report a late request as saved after stopping",async()=>{
    let resolve!:()=>void;const states:string[]=[];
    const queue=createDraftSaveQueue({save:()=>new Promise<void>(r=>{resolve=r;}),onState:s=>states.push(s.status)});
    queue.enqueue(safeFixture());await vi.advanceTimersByTimeAsync(1000);queue.stop();resolve();await Promise.resolve();await Promise.resolve();
    expect(states).not.toContain("saved");
  });
  it("retains the newest snapshot after failure but never retries a conflict",async()=>{
    const save=vi.fn(async()=>{throw new DraftApiError(409,"revision-conflict");});
    const queue=createDraftSaveQueue({save,onState:vi.fn()});queue.enqueue(safeFixture());await vi.advanceTimersByTimeAsync(1000);await vi.advanceTimersByTimeAsync(60000);
    expect(save).toHaveBeenCalledTimes(1);await expect(queue.flush()).rejects.toMatchObject({code:"revision-conflict"});queue.stop();
  });
  it("retries a network failure using the retained snapshot",async()=>{
    const titles:string[]=[];let attempt=0;
    const queue=createDraftSaveQueue({save:async form=>{titles.push(form.draft.title!);if(attempt++===0)throw new DraftApiError(0,"network");},onState:vi.fn()});
    queue.enqueue(safeFixture());await vi.advanceTimersByTimeAsync(1000);
    const latest=safeFixture();latest.draft.title="newest";queue.enqueue(latest);
    await vi.advanceTimersByTimeAsync(1000);await queue.flush();expect(titles).toEqual(["ทดสอบดราฟต์","newest"]);queue.stop();
  });
});
