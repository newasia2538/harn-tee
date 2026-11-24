import type {BillSummary} from "./bill-lifecycle";
export type HistorySyncProof={localId:string;editToken:string;shareToken?:string};
export type HistorySyncItem={localId:string;kind:"active";summary:BillSummary;shareUsable:boolean}|{localId:string;kind:"gone";state:"deleting"|"deleted"}|{localId:string;kind:"missing"};
export type HistorySyncResponse={serverNow:number;items:HistorySyncItem[]};
