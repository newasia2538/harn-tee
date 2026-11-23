import {formFromDocument,sanitizeDraftForm,type DraftAck,type DraftForm} from "./draft-state";
export function comparableForm(form:DraftForm){
  const safe=sanitizeDraftForm(form);if(safe.draft.recipient)safe.draft.recipient={...safe.draft.recipient,qr:null};return JSON.stringify(safe);
}
export function sameQr(left:DraftAck,right:DraftAck){return JSON.stringify(left.document.recipient.qr)===JSON.stringify(right.document.recipient.qr);}
export function recoveredQrUpload(before:DraftAck,after:DraftAck,selectionId:string){
  return after.document.status===before.document.status&&after.qrSelectionId===selectionId&&Boolean(after.document.recipient.qr)&&comparableForm(before.form??formFromDocument(before.document))===comparableForm(after.form??formFromDocument(after.document));
}
