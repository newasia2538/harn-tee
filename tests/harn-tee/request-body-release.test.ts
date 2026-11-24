import {expect,it,vi} from "vitest";
import {readLimitedBody} from "../../lib/harn-tee/request-body";
it("releases_an_unread_declared_oversized_body_without_buffering_it",async()=>{
 const cancel=vi.fn(),stream=new ReadableStream<Uint8Array>({cancel}),request=new Request("https://test.invalid",{method:"POST",body:stream,headers:{"Content-Length":"70000"},duplex:"half"} as RequestInit);
 await expect(readLimitedBody(request,65536)).rejects.toThrow("คำขอมีขนาดใหญ่เกินไป");expect(cancel).toHaveBeenCalledOnce();
});
