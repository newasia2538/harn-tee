export function createRetentionClock(monotonicNow:()=>number){
  let anchor:{serverNow:number;tick:number}|null=null;
  const now=()=>anchor?anchor.serverNow+Math.max(0,monotonicNow()-anchor.tick):null;
  return {
    sync(serverNow:number){
      if(!Number.isFinite(serverNow))return;
      anchor={serverNow:Math.max(serverNow,now()??serverNow),tick:monotonicNow()};
    },now,
  };
}
export type RemainingBillTime={kind:"days";days:number}|{kind:"countdown";text:string}|{kind:"expired"};
export function remainingBillTime(expiresAt:number,now:number):RemainingBillTime{
  const remaining=expiresAt-now;
  if(remaining<=0)return {kind:"expired"};
  if(remaining>=86_400_000)return {kind:"days",days:Math.ceil(remaining/86_400_000)};
  const seconds=Math.floor(remaining/1000),pad=(n:number)=>String(n).padStart(2,"0");
  return {kind:"countdown",text:`${pad(Math.floor(seconds/3600))}:${pad(Math.floor(seconds%3600/60))}:${pad(seconds%60)}`};
}
