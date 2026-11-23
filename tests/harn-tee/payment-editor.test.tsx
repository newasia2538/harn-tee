// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {PaymentEditor} from "../../components/harn-tee/payment-editor";
import {draftFixture} from "../helpers/draft-fixtures";
afterEach(cleanup);
it("clears PromptPay when its type changes and explains ID reentry",()=>{
 const recipient={...draftFixture().draft.recipient!,promptPay:{type:"national-id" as const,value:"1234567890123"}},change=vi.fn();
 render(<PaymentEditor recipient={recipient} qrFile={null} onChange={change} onQrChange={vi.fn()} nationalIdReentryRequired/>);
 fireEvent.change(screen.getByLabelText("ประเภท PromptPay"),{target:{value:"phone"}});expect(change).toHaveBeenCalledWith({...recipient,promptPay:{type:"phone",value:""}});
 expect(screen.getByText("เพื่อความเป็นส่วนตัว เลขประชาชน PromptPay จะไม่ถูกบันทึกในดราฟต์ หากปิดหรือรีเฟรชหน้านี้ กรุณากรอกใหม่")).toBeTruthy();
});
