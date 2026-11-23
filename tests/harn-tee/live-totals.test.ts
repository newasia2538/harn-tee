import {describe,expect,it} from "vitest";
import {selectLiveTotals} from "../../lib/harn-tee/live-totals";
import {draftFixture} from "../helpers/draft-fixtures";
import {setNumericInput} from "../../lib/harn-tee/draft-state";
describe("current bill totals",()=>{
  it("uses both existing bill formulas before split rounding",()=>{
    const form=draftFixture();form.draft.serviceChargePercent=10;form.draft.vatPercent=7;
    const c=selectLiveTotals(form).calculation;
    expect([c.subtotalSatang,c.serviceChargeSatang,c.vatSatang,c.grossTotalSatang]).toEqual([10000,1000,770,11770]);
    form.draft.calculationMode="separate";expect(selectLiveTotals(form).calculation.grossTotalSatang).toBe(11700);
  });
  it("uses per-item fees and updates after removal and formula changes",()=>{
    const form=draftFixture();form.draft.feeMode="item";form.draft.items[0]={...form.draft.items[0],vatPercent:7,serviceChargePercent:10};
    form.draft.items.push({...form.draft.items[0],id:"i2",priceSatang:5000,order:1});
    expect(selectLiveTotals(form).calculation.grossTotalSatang).toBe(17655);
    form.draft.items[1].serviceChargePercent=5;
    form.draft.items[1].vatPercent=10;
    expect(selectLiveTotals(form).calculation.grossTotalSatang).toBe(17545);
    form.draft.calculationMode="separate";expect(selectLiveTotals(form).calculation.grossTotalSatang).toBe(17450);
    form.draft.items.pop();expect(selectLiveTotals(form).calculation.grossTotalSatang).toBe(11700);
  });
  it("keeps receipt total distinct from the rounded collection",()=>{
    const form=draftFixture();form.draft.participants=[0,1,2].map(i=>({id:`p${i}`,name:`คน ${i}`,order:i}));form.draft.items[0].payerIds=["p0","p1","p2"];
    const totals=selectLiveTotals(form);expect(totals.calculation.grossTotalSatang).toBe(10000);expect(totals.calculation.collectedTotalSatang).toBe(10002);
    form.draft.items[0].payerIds=[];expect(selectLiveTotals(form).unassignedCount).toBe(1);expect(selectLiveTotals(form).calculation.grossTotalSatang).toBe(10000);
  });
  it.each(["7.","-1","NaN","99999999999999999999"])("makes invalid %s provisional without invalid amounts",raw=>{
    const totals=selectLiveTotals(setNumericInput(draftFixture(),{kind:"price",itemId:"i1"},raw));
    expect(totals.provisional).toBe(true);expect(Number.isSafeInteger(totals.calculation.grossTotalSatang)).toBe(true);
  });
});
