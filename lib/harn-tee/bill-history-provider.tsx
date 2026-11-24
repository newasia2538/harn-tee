"use client";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {usePathname} from "next/navigation";
import {openDraftStore,type DraftStore} from "./draft-store";
import {billServerClock} from "./bill-clock";
import {createHistoryApi} from "./history-api";
import {createHistorySync} from "./history-sync";
import {createRetentionClock} from "./retention-clock";
import {receiveBillEvent,subscribeBillEvents} from "./bill-events";
import type {HistoryEntry} from "./history-state";
type HistoryView={entries:HistoryEntry[];loading:boolean;error:string|null;clock:ReturnType<typeof createRetentionClock>;refresh:()=>Promise<void>;remove:(entry:HistoryEntry)=>Promise<void>};
const fallback:HistoryView={entries:[],loading:false,error:"storage-unavailable",clock:createRetentionClock(()=>0),refresh:async()=>{},remove:async()=>{}};
const Context=createContext<HistoryView>(fallback);
export const useBillHistory=()=>useContext(Context);
export function BillHistoryProvider({children}:{children:ReactNode}){
 const [state,setState]=useState({entries:[] as HistoryEntry[],loading:true,error:null as string|null});
 const [clock]=useState(()=>billServerClock);
 const controller=useRef<ReturnType<typeof createHistorySync>|null>(null),pathname=usePathname();
 useEffect(()=>{
  let alive=true,store:DraftStore|undefined,sync:ReturnType<typeof createHistorySync>|undefined,unsubscribe:(()=>void)|undefined;
  const reload=async()=>{if(!alive||!store)return;try{const entries=await store.history.list();if(alive)setState({entries,loading:false,error:null});}catch{if(alive)setState(s=>({...s,loading:false,error:"storage-unavailable"}));}};
  const refresh=(reason:"entry"|"foreground"|"online")=>{void sync?.refresh(reason).catch(()=>{if(alive)setState(s=>({...s,error:"offline"}));});};
  void openDraftStore().then(opened=>{
   if(!alive){opened.close();return;}store=opened;sync=createHistorySync({store:store.history,api:createHistoryApi(),clock});controller.current=sync;unsubscribe=sync.subscribe(()=>{void reload();});void reload();refresh("entry");
  }).catch(()=>{if(alive)setState(s=>({...s,loading:false,error:"storage-unavailable"}));});
  const visible=()=>{if(document.visibilityState==="visible")refresh("foreground");},online=()=>refresh("online"),local=()=>{void reload();};
  const channel=typeof BroadcastChannel!=="undefined"?new BroadcastChannel("harn-tee-bills"):null;
  if(channel)channel.onmessage=event=>receiveBillEvent(event.data);
  const events=subscribeBillEvents(()=>{void reload();refresh("foreground");});
  window.addEventListener("online",online);window.addEventListener("harn-tee-history",local);document.addEventListener("visibilitychange",visible);
  return ()=>{alive=false;controller.current=null;unsubscribe?.();events();sync?.dispose();store?.close();channel?.close();window.removeEventListener("online",online);window.removeEventListener("harn-tee-history",local);document.removeEventListener("visibilitychange",visible);};
 },[clock]);
 useEffect(()=>{void controller.current?.refresh("entry").catch(()=>undefined);},[pathname]);
 const refresh=async()=>{try{await controller.current?.refresh("manual");}catch{setState(s=>({...s,error:"offline"}));}};
 return <Context.Provider value={{...state,clock,refresh,remove:async entry=>{await controller.current?.remove(entry);}}}>{children}</Context.Provider>;
}
