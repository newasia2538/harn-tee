import {expect,it,vi} from "vitest";
import {createHistoryApi} from "../../lib/harn-tee/history-api";
import {createDraftApi} from "../../lib/harn-tee/draft-api";
it("sends_private_bounded_proofs_and_original_delete_precondition",async()=>{
 const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({serverNow:100,items:[]})).mockResolvedValueOnce(Response.json({state:"deleting",serverNow:200},{status:202})).mockResolvedValueOnce(Response.json({serverNow:300}));const api=createHistoryApi(fetcher);
 await api.sync([{localId:"l",editToken:"e",shareToken:"s"}]);await api.remove("e","r");await api.maintain();
 expect(fetcher.mock.calls[0]).toMatchObject(["/api/bills/history",{method:"POST",cache:"no-store",body:JSON.stringify({entries:[{localId:"l",editToken:"e",shareToken:"s"}]})}]);expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({"If-Match":'"r"'});expect(fetcher.mock.calls[2][1]?.body).toBe("{}");
});
it("recognizes_gone_without_treating_network_or_unknown_as_deletion",async()=>{
 for(const code of ["bill-deleting","bill-deleted"]){const api=createDraftApi(vi.fn().mockResolvedValue(Response.json({code},{status:410})));await expect(api.load("e")).rejects.toMatchObject({status:410,code});}
 const api=createHistoryApi(vi.fn().mockRejectedValue(new Error("offline")));await expect(api.remove("e","r")).rejects.toMatchObject({status:0,code:"network"});
});
