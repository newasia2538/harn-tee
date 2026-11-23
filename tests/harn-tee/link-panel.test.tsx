// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {LinkPanel} from "../../components/harn-tee/link-panel";
afterEach(cleanup);
it("can start the next bill while preserving the previous links on screen",()=>{
 const start=vi.fn();render(<LinkPanel shareUrl="https://harn.test/share/s" editUrl="https://harn.test/edit/e" onStartNew={start}/>);
 expect(screen.getByText("https://harn.test/edit/e")).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"เริ่มทำรายการใหม่"}));expect(start).toHaveBeenCalledOnce();
});
