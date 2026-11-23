// @vitest-environment jsdom
import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {FeeEditor} from "../../components/harn-tee/fee-editor";
afterEach(cleanup);
it("restores controlled raw percent text without prefilling zero",()=>{
 const change=vi.fn();render(<FeeEditor vatPercent={0} serviceChargePercent={0} feeMode="bill" calculationMode="separate" onModeChange={vi.fn()} onCalculationModeChange={vi.fn()} onChange={vi.fn()} numbers={{vat:"7.",service:""}} onNumericChange={change}/>);
 expect((screen.getByLabelText("VAT") as HTMLInputElement).value).toBe("7.");expect((screen.getByLabelText("Service charge") as HTMLInputElement).value).toBe("");
 fireEvent.change(screen.getByLabelText("VAT"),{target:{value:"7.5"}});expect(change).toHaveBeenCalledWith({kind:"vat"},"7.5");
});
