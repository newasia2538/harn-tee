export type BillEvent={billId:string;kind:"updated"|"deleting"|"deleted"};
const listeners=new Set<(event:BillEvent)=>void>();
export function subscribeBillEvents(listener:(event:BillEvent)=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
export function receiveBillEvent(value:unknown){
 if(!value||typeof value!=="object"||!("billId" in value)||typeof value.billId!=="string"||!("kind" in value)||!["updated","deleting","deleted"].includes(String(value.kind)))return;
 const event:BillEvent={billId:value.billId,kind:value.kind as BillEvent["kind"]};for(const listener of listeners)listener(event);
}
export function broadcastBillEvent(event:BillEvent){
 receiveBillEvent(event);
 if(typeof window!=="undefined"&&typeof BroadcastChannel!=="undefined"){const channel=new BroadcastChannel("harn-tee-bills");channel.postMessage({billId:event.billId,kind:event.kind});channel.close();}
}

export function notifyHistoryChanged(){if(typeof window!=="undefined")window.dispatchEvent(new Event("harn-tee-history"));}
