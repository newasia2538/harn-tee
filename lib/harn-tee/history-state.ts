import type {BillSummary} from "./bill-lifecycle";
export type HistorySyncProof={localId:string;editToken:string;shareToken?:string};
export type HistorySyncItem={localId:string;kind:"active";summary:BillSummary;shareUsable:boolean}|{localId:string;kind:"gone";state:"deleting"|"deleted"}|{localId:string;kind:"missing"};
export type HistorySyncResponse={serverNow:number;items:HistorySyncItem[]};
export type HistorySyncState="synced"|"pending"|"offline"|"conflict";
export type ActiveHistoryEntry={kind:"bill";schemaVersion:1;localId:string;recordIds:string[];billId?:string;editToken?:string;shareToken?:string;revision?:string;title:string;totalSatang:number;lifecycle:import("./bill-lifecycle").LifecycleSnapshot;deadlineSource:"local"|"server";localVersion:number;syncState:HistorySyncState;pendingDelete?:{revision:string;requestedAt:number};shareUsable:boolean};
export type PendingHistoryEntry={kind:"deleting";schemaVersion:1;localId:string;billId:string;editToken:string;revision:string;localVersion:number;requestedAt:number;syncState:HistorySyncState};
export type HistoryEntry=ActiveHistoryEntry|PendingHistoryEntry;
