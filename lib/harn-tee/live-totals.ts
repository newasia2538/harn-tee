import {invalidNumberFields,normalizeFormNumbers,type DraftForm} from "./draft-state";
import {calculateBill} from "./money";
export function selectLiveTotals(form:DraftForm){
  const normalized=normalizeFormNumbers(form),invalidFields=invalidNumberFields(form);
  const percent=(value:number|undefined)=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=100?value:0;
  let budget=Math.floor(Number.MAX_SAFE_INTEGER/4);
  const items=normalized.draft.items.map(item=>{
    const valid=Number.isSafeInteger(item.priceSatang)&&item.priceSatang>=0&&item.priceSatang<=budget;
    if(!valid)invalidFields.push("price:"+item.id);
    const priceSatang=valid?item.priceSatang:0;budget-=priceSatang;
    return {...item,priceSatang,vatPercent:percent(item.vatPercent),serviceChargePercent:percent(item.serviceChargePercent)};
  });
  const draft={...normalized.draft,items,vatPercent:percent(normalized.draft.vatPercent),serviceChargePercent:percent(normalized.draft.serviceChargePercent)};
  const unassignedCount=items.filter(item=>!item.payerIds.some(id=>draft.participants.some(p=>p.id===id))).length;
  return {calculation:calculateBill(draft),invalidFields,unassignedCount,provisional:Boolean(invalidFields.length||unassignedCount||items.length===0||items.some(item=>!item.name.trim()||item.priceSatang===0))};
}
