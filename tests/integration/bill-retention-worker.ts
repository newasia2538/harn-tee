// Test-only loopback fixture. Never imported by the application.
import {env} from "cloudflare:workers";
import {buildBillDocument} from "../../db/document";
import {createOpaqueToken,hashToken} from "../../lib/harn-tee/tokens";
import {BILL_COLUMNS,retentionRolloutAt,type StoredBillRow} from "../../db/bill-retention-store";
import {lookupBillAccess} from "../../db/bill-access";
import {revokeBillSnapshot,drainBillQrCleanup} from "../../db/bill-deletion";
import {registerQrAsset,settleQrAsset} from "../../db/bill-qr-assets";
import {createDraftOnce,deleteBillByEditToken,readEditCheckpoint} from "../../db/repository";
import {sanitizeDraftForm,formFromDocument} from "../../lib/harn-tee/draft-state";
const bindings=()=>({DB:env.DB!,BUCKET:env.BUCKET!});
const doc=(status:"draft"|"published"="published",paid=false,zero=false)=>{const d=buildBillDocument({title:"Native synthetic bill",participants:[{id:"p",name:"Tester",order:0}],items:[{id:"i",name:"Test item",priceSatang:zero?0:10000,payerIds:["p"],order:0}],vatPercent:0,serviceChargePercent:0,recipient:{name:"Tester",bank:null,promptPay:null,qr:null,visible:true}},Date.now(),status);d.participants[0].paid=paid;return d;};
async function seed(label:string,options:{legacy?:boolean;paid?:boolean;zero?:boolean;status?:"draft"|"published";qr?:boolean}={}){
 const id="native-"+label+"-"+crypto.randomUUID(),edit=createOpaqueToken(),share=createOpaqueToken(),d=doc(options.status,options.paid,options.zero),now=Date.now();
 if(options.qr){d.recipient.qr={objectKey:`bills/${id}/current.png`,contentType:"image/png",size:8};await env.BUCKET!.put(d.recipient.qr.objectKey,new Uint8Array([137,80,78,71,13,10,26,10]));}
 await env.DB!.prepare("INSERT INTO bills (id,share_token_digest,edit_token_digest,payload_json,created_at,updated_at,last_activity_at,all_paid_at,expires_at) VALUES (?1,?2,?3,?4,?5,?5,?6,?7,?8)").bind(id,await hashToken(share),await hashToken(edit),JSON.stringify(d),now,options.legacy?null:now,options.paid&&!options.zero?now:null,options.legacy?null:now+2592000000).run();return {id,edit,share};
}
async function row(id:string){return (await env.DB!.prepare("SELECT "+BILL_COLUMNS+" FROM bills WHERE id=?1").bind(id).first<StoredBillRow>())!;}
const assert=(value:unknown,label:string)=>{if(!value)throw new Error(label);};
async function scenario(name:string,input:{id?:string}){
 const b=bindings(),now=Date.now();
 switch(name){
 case "grace":{
  const rollout=await retentionRolloutAt(b);
  for(const [kind,options,days] of [["unpaid",{},30],["paid",{paid:true},7],["draft",{status:"draft" as const},30],["zero",{paid:true,zero:true},30]] as const){const bill=await seed(kind,{...options,legacy:true});const first=await lookupBillAccess(b,"edit",bill.edit,now);assert(first.kind==="active"&&first.row.expires_at===rollout+days*86400000,"one-time grace "+kind);await lookupBillAccess(b,"edit",bill.edit,now);assert((await row(bill.id)).expires_at===rollout+days*86400000,"grace not renewed");}
  return {assertions:8};
 }
 case "boundary":{
  const bill=await seed(name),expires=Date.now()+60000;await env.DB!.prepare("UPDATE bills SET expires_at=?1 WHERE id=?2").bind(expires,bill.id).run();assert((await lookupBillAccess(b,"edit",bill.edit,expires-1)).kind==="active","before expiry");assert((await lookupBillAccess(b,"share",bill.share,expires)).kind==="gone","exact expiry");return {assertions:2};
 }
 case "batch":{
  const bill=await seed(name),before=(await row(bill.id)).retention_version;let failed=false;
  try{await env.DB!.batch([env.DB!.prepare("UPDATE bills SET retention_version=retention_version+1 WHERE id=?1").bind(bill.id),env.DB!.prepare("INSERT INTO bill_retention_policy (id,rollout_at) VALUES ('lifecycle-v1',0)")]);}catch{failed=true;}assert(failed,"batch failure");assert((await row(bill.id)).retention_version===before,"D1 batch rollback");return {assertions:2};
 }
 case "peer":{
  const bill=await seed(name),snapshot=await row(bill.id),after=snapshot.expires_at!+1;
  await env.DB!.prepare("UPDATE bills SET expires_at=?1,retention_version=retention_version+1 WHERE id=?2").bind(after+86400000,bill.id).run();assert(await revokeBillSnapshot(b,snapshot,"expired",after)==="conflict","peer renewal survives");assert(Boolean(await row(bill.id)),"peer bill remains");return {assertions:2};
 }
 case "stale":{
  const bill=await seed(name),ack=(await readEditCheckpoint(bill.edit))!;await env.DB!.prepare("UPDATE bills SET retention_version=retention_version+1 WHERE id=?1").bind(bill.id).run();let conflict=false;try{await deleteBillByEditToken(bill.edit,ack.revision);}catch(error){conflict=error instanceof Error&&error.message==="revision-conflict";}assert(conflict,"stale manual confirmation");assert(Boolean(await row(bill.id)),"stale delete preserves payload");return {assertions:2};
 }
 case "replay":{
  const key=createOpaqueToken(),form=sanitizeDraftForm(formFromDocument(doc("draft"))),ack=await createDraftOnce(key,form);assert((await deleteBillByEditToken(ack.editToken,ack.revision))?.state==="deleted","delete create-once");let gone=false;try{await createDraftOnce(key,form);}catch(error){gone=error instanceof Error&&error.message==="bill-deleted";}assert(gone,"creation replay denied");assert((await deleteBillByEditToken(ack.editToken,ack.revision))?.state==="deleted","repeat delete");return {assertions:3};
 }
 case "late-put":{
  const bill=await seed(name),snapshot=await row(bill.id),key=`bills/${bill.id}/held.png`;await registerQrAsset(b,snapshot,key,"selection",now);
  let release!:()=>void;const held=new Promise<void>(resolve=>release=resolve);const upload=held.then(()=>env.BUCKET!.put(key,"late bytes"));
  await revokeBillSnapshot(b,snapshot,"manual",now);assert(await drainBillQrCleanup(b,bill.id,now,20)==="deleting","unresolved PUT stays pending");release();await upload;await settleQrAsset(b,key,"stored",now+1);assert(await drainBillQrCleanup(b,bill.id,now+2,20)==="deleted","late PUT cleaned");assert(!await env.BUCKET!.head(key),"late object absent");return {assertions:3};
 }
 case "failure":{
  const bill=await seed(name,{qr:true}),snapshot=await row(bill.id);await revokeBillSnapshot(b,snapshot,"manual",now);
  const failed=new Proxy(env.BUCKET!,{get(target,key){if(key==="delete")return async()=>{throw new Error("synthetic R2 failure");};const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});
  assert(await drainBillQrCleanup({...b,BUCKET:failed},bill.id,now,20)==="deleting","R2 failure remains pending");assert(Boolean(await env.DB!.prepare("SELECT object_key FROM bill_qr_assets WHERE bill_id=?1").bind(bill.id).first()),"durable cleanup intent");return {assertions:2,id:bill.id};
 }
 case "restart":{
  assert(input.id?.startsWith("native-failure-"),"synthetic restart target");assert(await drainBillQrCleanup(b,input.id!,now+3600001,20)==="deleted","restart drains durable intent");assert(!await row(input.id!),"deleted row absent");assert((await env.BUCKET!.list({prefix:`bills/${input.id}/`})).objects.length===0,"deleted QR absent");return {assertions:3};
 }
 case "prefix":{
  const bill=await seed(name,{qr:true});await env.BUCKET!.put(`bills/${bill.id}/legacy-orphan.png`,"orphan");await revokeBillSnapshot(b,await row(bill.id),"manual",now);assert(await drainBillQrCleanup(b,bill.id,now,20)==="deleted","untracked prefix cleanup");assert((await env.BUCKET!.list({prefix:`bills/${bill.id}/`})).objects.length===0,"all owned blobs absent");const marker=await env.DB!.prepare("SELECT * FROM bill_deletions WHERE id=?1").bind(bill.id).first<Record<string,unknown>>();assert(marker?.state==="deleted"&&!Object.keys(marker).some(k=>/payload|title|account|qr/i.test(k)),"minimal marker");return {assertions:3};
 }
 default:throw new Error("unknown synthetic scenario");
 }
}
export default {async fetch(request:Request){
 const url=new URL(request.url);if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname))return new Response(null,{status:403});
 if(url.pathname==="/health")return new Response("ok");if(request.method!=="POST"||url.pathname!=="/fixture")return new Response(null,{status:404});
 try{const input=await request.json() as {name:string;id?:string};return Response.json(await scenario(input.name,input));}catch(error){return Response.json({failed:error instanceof Error?error.message:"native assertion"},{status:500});}
}};
