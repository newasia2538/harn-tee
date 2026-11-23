import { makeBlankForm, sanitizeDraftForm } from "../../lib/harn-tee/draft-state";
export function draftFixture(){
  const form=makeBlankForm();form.draft.title="ทดสอบดราฟต์";
  form.draft.participants=[{id:"p1",name:"เอ",order:0}];
  form.draft.items=[{id:"i1",name:"ข้าว",priceSatang:10000,payerIds:["p1"],order:0}];
  form.draft.recipient={name:"ผู้รับ",bank:{bankId:"SCB",accountNumber:"1234567890"},promptPay:null,qr:null,visible:true};
  return form;
}
export const safeFixture=()=>sanitizeDraftForm(draftFixture());
