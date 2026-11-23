import {sanitizeDraftForm,type SafeDraftForm,type SaveState} from "./draft-state";
import {DraftApiError} from "./draft-api";
export type DraftSaveQueue={enqueue(form:SafeDraftForm):void;flush():Promise<void>;retry():void;stop():void};
export function createDraftSaveQueue({save,onState}:{save:(form:SafeDraftForm,signal:AbortSignal)=>Promise<void>;onState:(state:SaveState)=>void}):DraftSaveQueue {
  let pending:SafeDraftForm|null=null,inFlight:Promise<void>|null=null,timer:ReturnType<typeof setTimeout>|undefined;
  let stopped=false,conflict=false,firstPendingAt:number|null=null,error:unknown,retries=0,controller:AbortController|null=null;
  const clear=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;};
  const emit=(state:SaveState)=>{if(!stopped)onState(state);};
  const schedule=(delay:number)=>{clear();timer=setTimeout(()=>{void run();},delay);};
  function run():Promise<void>{
    clear();if(stopped||conflict||!pending)return inFlight??Promise.resolve();if(inFlight)return inFlight;
    const snapshot=pending;pending=null;firstPendingAt=null;controller=new AbortController();const signal=controller.signal;
    error=undefined;emit({status:"saving"});let succeeded=false;
    inFlight=Promise.resolve().then(()=>save(snapshot,signal)).then(()=>{
      if(stopped)return;succeeded=true;retries=0;
      emit(pending?{status:"pending"}:{status:"saved",savedAt:Date.now()});
    }).catch(caught=>{
      if(stopped)return;error=caught;if(!pending)pending=snapshot;
      conflict=caught instanceof DraftApiError&&caught.status===409;
      emit({status:conflict?"conflict":"error",code:caught instanceof DraftApiError?caught.code:"network"});
      if(!conflict)schedule([1000,2000,5000,15000,30000][Math.min(retries++,4)]);
    }).finally(()=>{
      inFlight=null;controller=null;
      if(!stopped&&!conflict&&pending&&succeeded)void run();
    });
    return inFlight;
  }
  return {
    enqueue(form){
      if(stopped||conflict)return;pending=sanitizeDraftForm(form);
      if(firstPendingAt===null)firstPendingAt=Date.now();emit({status:"pending"});
      if(!inFlight&&!error)schedule(Math.max(0,Math.min(1000,5000-(Date.now()-firstPendingAt))));
    },
    async flush(){
      clear();if(conflict)throw error;
      while(!stopped&&(inFlight||pending)){
        if(inFlight)await inFlight;else await run();
        if(error){clear();throw error;}
      }
    },
    retry(){if(stopped||conflict)return;error=undefined;retries=0;void run();},
    stop(){stopped=true;clear();controller?.abort();pending=null;},
  };
}
