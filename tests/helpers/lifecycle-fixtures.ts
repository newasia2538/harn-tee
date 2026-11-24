import {advanceLifecycle,paymentProgress} from "../../lib/harn-tee/bill-lifecycle";
import type {BillDocument} from "../../lib/harn-tee/types";
/** Complete protocol metadata for client tests; lifecycle assertions use literal fixtures separately. */
export function withLifecycle<T extends {document:BillDocument}>(value:T){
  const now=value.document.updatedAt;
  return {...value,lifecycle:{...advanceLifecycle(null,null,value.document,now,true),...paymentProgress(value.document)},serverNow:now};
}
