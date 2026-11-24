import {spawn} from "node:child_process";
import {readFile,writeFile,mkdir,realpath} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {randomBytes} from "node:crypto";
const root=fileURLToPath(new URL("../",import.meta.url));
const args=new Map();for(let n=2;n<process.argv.length;n+=2)args.set(process.argv[n],process.argv[n+1]);
const appMode=args.has("--app-base-url"),base=new URL(args.get(appMode?"--app-base-url":"--base-url")??"http://127.0.0.1:8790");
if(base.protocol!=="http:"||!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password||base.pathname!=="/")throw new Error("Only loopback HTTP verification is allowed");
const storage=await realpath(args.get(appMode?"--app-persist-to":"--persist-to")??"");
if(!/^\/(?:private\/)?tmp\/harn-tee-retention-qa\.[A-Za-z0-9_-]+$/.test(storage))throw new Error("Use a disposable /tmp/harn-tee-retention-qa.* directory");
const runtime=path.join(storage,"runtime");await mkdir(runtime,{recursive:true});
const environment={...process.env,SITES_RUNTIME_ROOT:runtime,WRANGLER_SEND_METRICS:"false",WRANGLER_WRITE_LOGS:"false",CLOUDFLARE_CF_FETCH_ENABLED:"false"};
const wrangler=["--import",path.join(root,"scripts/sites-env.mjs"),path.join(root,"node_modules/wrangler/bin/wrangler.js")];
const config=appMode?path.join(storage,"migration-config.json"):path.join(root,"tests/integration/wrangler.retention.jsonc");
if(appMode){const built=JSON.parse(await readFile(path.join(root,"dist/server/wrangler.json"),"utf8"));built.main=path.join(root,"dist/server",built.main);if(built.assets)built.assets.directory=path.resolve(root,"dist/server",built.assets.directory);for(const db of built.d1_databases)db.migrations_dir=path.join(root,"drizzle");await writeFile(config,JSON.stringify(built));}
async function command(parameters){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[...wrangler,...parameters],{cwd:root,env:environment,stdio:["ignore","pipe","pipe"]});let output="";child.stdout.on("data",data=>output+=data);child.stderr.on("data",data=>output+=data);child.on("error",reject);child.on("exit",code=>code===0?resolve(output):reject(new Error("Local Wrangler command failed; rerun with the disposable fixture configuration")));});}
const migration=()=>command(["d1","migrations","apply","DB","--config",config,"--local","--persist-to",storage]);
const sql=statement=>command(["d1","execute","DB","--config",config,"--local","--persist-to",storage,"--command",statement,"--json"]);
let ownedWorker;let assertionCount=0;
function assert(value,label){if(!value)throw new Error(label);assertionCount++;}
async function migrateTwice(){await migration();const before=await sql("SELECT rollout_at FROM bill_retention_policy WHERE id='lifecycle-v1'");await migration();const after=await sql("SELECT rollout_at FROM bill_retention_policy WHERE id='lifecycle-v1'");assert(JSON.parse(before)[0].results[0].rollout_at===JSON.parse(after)[0].results[0].rollout_at,"migration journal preserves rollout time");}
async function stop(){if(!ownedWorker)return;const worker=ownedWorker;ownedWorker=undefined;worker.kill("SIGTERM");await Promise.race([new Promise(resolve=>worker.once("exit",resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);if(worker.exitCode===null)worker.kill("SIGKILL");}
async function start(){
 ownedWorker=spawn(process.execPath,[...wrangler,"dev","--config",config,"--local","--persist-to",storage,"--ip","127.0.0.1","--port",base.port,"--inspector-port","0"],{cwd:root,env:environment,stdio:["ignore","pipe","pipe"]});
 let logs="";ownedWorker.stdout.on("data",data=>{logs=(logs+data).slice(-20000);});ownedWorker.stderr.on("data",data=>{logs=(logs+data).slice(-20000);});
 for(let n=0;n<80;n++){if(ownedWorker.exitCode!==null)throw new Error("Fixture worker could not start: "+logs.replace(/\x1b\[[0-9;]*m/g,"").slice(-2500));try{if((await fetch(new URL("health",base),{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}throw new Error("Fixture readiness timed out");
}
async function fixture(name,extra={}){const response=await fetch(new URL("fixture",base),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,...extra})});const result=await response.json();if(!response.ok)throw new Error("Native fixture "+name+": "+result.failed);assertionCount+=result.assertions;console.log("PASS native "+name);return result;}
const token=()=>randomBytes(32).toString("base64url");
const form=()=>({draft:{title:"Native HTTP synthetic bill",participants:[{id:"p",name:"Tester",order:0}],items:[{id:"i",name:"Test item",priceSatang:10000,payerIds:["p"],order:0}],vatPercent:7,serviceChargePercent:10,recipient:{name:"Tester",bank:{bankId:"SCB",accountNumber:"1234567890"},promptPay:null,qr:null,visible:true}},step:0,numbers:{prices:{},itemVat:{},itemService:{},vat:"7",service:"10"},paymentReentryRequired:false});
async function api(url,{method="GET",body,revision,headers={},status=200}={}){
 console.log("PROBE "+method+" "+url.replace(/\/api\/bills\/[^/?]+/g,"/api/bills/[proof]"));
 const headerFile=path.join(storage,"probe.headers"),bodyFile=path.join(storage,"probe.body"),inputFile=path.join(storage,"probe.input");
 const parameters=["--silent","--show-error","--max-time","45","--request",method,"--dump-header",headerFile,"--output",bodyFile];
 if(body!==undefined){await writeFile(inputFile,JSON.stringify(body));parameters.push("--header","Content-Type: application/json","--data-binary","@"+inputFile);}
 if(revision)parameters.push("--header",`If-Match: "${revision}"`);
 for(const [name,value] of Object.entries(headers))parameters.push("--header",name+": "+value);
 parameters.push(new URL(url,base).href);
 await new Promise((resolve,reject)=>{const child=spawn("curl",parameters,{stdio:"ignore"});child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(new Error("Local HTTP probe failed")));});
 const rawHeaders=await readFile(headerFile,"utf8"),blocks=rawHeaders.trim().split(/\r?\n\r?\n/),lines=blocks.at(-1).split(/\r?\n/),code=Number(lines.shift().split(" ")[1]),parsedHeaders=new Headers();for(const line of lines){const colon=line.indexOf(":");if(colon>0)parsedHeaders.append(line.slice(0,colon),line.slice(colon+1).trim());}
 const response=new Response(await readFile(bodyFile),{status:code,headers:parsedHeaders});
 assert(response.status===status,`HTTP ${method} expected ${status}, got ${response.status}`);assert(response.headers.get("Cache-Control")?.includes("no-store"),"private response no-store");return response;
}
async function create(){const input=form(),creationKey=token(),response=await api("/api/bills/drafts",{method:"POST",body:{creationKey,form:input}});return {input,creationKey,ack:await response.json()};}
async function unavailable(bill,expected){
 const {ack,input}=bill,endpoint="/api/bills/"+ack.editToken;
 const cases=[[endpoint,"GET"],[endpoint,"PATCH",{title:"changed"}],[endpoint+"/draft","GET"],[endpoint+"/draft","PUT",{form:input}],[endpoint+"/publish","POST",{form:input,confirmationId:"new",shareToken:ack.shareToken}],[endpoint+"/share-capability","POST",{}],[endpoint+"/status","POST",{participantId:"p",paid:true}],[endpoint+"/payment-details?field=bank","GET"],[endpoint+"/qr","GET"],[endpoint+"/qr","POST",{}],["/api/bills/"+ack.shareToken,"GET"]];
 for(const [url,method,body] of cases){const response=await api(url,{method,body,revision:ack.revision,status:410});const raw=await response.text();assert(JSON.parse(raw).code===expected,"consistent gone code");assert(!/1234567890|Test item|Native HTTP/.test(raw),"no personal payload in gone response");}
 const legacy=await api(endpoint+"/status",{method:"POST",body:{participantId:"p",paid:true},status:410});assert((await legacy.json()).code===expected,"legacy status gone");
}
try{
 await migrateTwice();
 if(!appMode){await start();for(const name of ["grace","automatic","boundary","batch","peer","stale","replay","late-put","prefix"])await fixture(name);const pending=await fixture("failure");await stop();await start();await fixture("restart",{id:pending.id});}
 else{
  const active=await create();let {ack}=active;const key="/api/bills/"+ack.editToken;
  const png=new Uint8Array([137,80,78,71,13,10,26,10]),file=new FormData();file.append("file",new Blob([png],{type:"image/png"}),"qr.png");
  const upload=await fetch(new URL(key+"/qr",base),{method:"POST",headers:{"If-Match":`"${ack.revision}"`,"X-Harn-Tee-Save-Mode":"draft","X-Harn-Tee-Qr-Selection":"native"},body:file});assert(upload.ok,"real QR upload");ack=await upload.json();active.ack={...active.ack,...ack};
  ack=await (await api(key+"/publish",{method:"POST",revision:ack.revision,body:{form:active.input,confirmationId:"native-publish",shareToken:active.ack.shareToken}})).json();active.ack={...active.ack,...ack};
  const shared=await (await api("/api/bills/"+active.ack.shareToken)).json();assert(!JSON.stringify(shared).includes("1234567890"),"masked public summary");assert((await (await api("/api/bills/"+active.ack.shareToken+"/payment-details?field=bank")).json()).value==="1234567890","authorized unmask");assert((await api("/api/bills/"+active.ack.shareToken+"/qr")).headers.get("Content-Type")?.includes("image/png"),"authorized QR bytes");
  await api(key,{method:"DELETE",status:428});await api("/api/bills/"+active.ack.shareToken,{method:"DELETE",revision:ack.revision,status:404});
  const paid=await (await api(key+"/status",{method:"POST",body:{participantId:"p",paid:true}})).json();assert(paid.lifecycle.expiresAt-paid.lifecycle.allPaidAt===604800000,"all paid seven days");
  const unpaid=await (await api(key+"/status",{method:"POST",body:{participantId:"p",paid:false}})).json();assert(unpaid.lifecycle.allPaidAt===null&&unpaid.lifecycle.expiresAt-unpaid.lifecycle.lastActivityAt===2592000000,"reverted thirty days");
  const repaid=await (await api(key+"/status",{method:"POST",body:{participantId:"p",paid:true}})).json();assert(repaid.lifecycle.allPaidAt>=paid.lifecycle.allPaidAt,"recompleted seven-day anchor");await api(key,{method:"DELETE",revision:ack.revision,status:409});
  ack=await (await api(key+"/draft")).json();const noOp=await (await api(key+"/publish",{method:"POST",revision:ack.revision,body:{form:active.input,confirmationId:"same-new-confirmation",shareToken:active.ack.shareToken}})).json();assert(noOp.lifecycle.expiresAt===ack.lifecycle.expiresAt&&noOp.document.participants[0].paid,"identical published confirmation preserves paid lifetime");ack=noOp;
  const history=await (await api("/api/bills/history",{method:"POST",body:{entries:[{localId:"native",editToken:active.ack.editToken,shareToken:active.ack.shareToken}]}})).json();assert(history.items[0].shareUsable&&!JSON.stringify(history).includes("1234567890"),"private summary proof");
  await api("/api/bills/history",{method:"POST",body:{entries:Array.from({length:21},()=>({localId:"x",editToken:active.ack.editToken}))},status:400});await api("/api/bills/history",{method:"POST",body:{padding:"x".repeat(65537)},status:413});await api("/api/bills/nonexistent-proof",{status:404});
  const deleted=await (await api(key,{method:"DELETE",revision:ack.revision})).json();assert(deleted.state==="deleted","manual deletion complete");await unavailable(active,"bill-deleted");await api("/api/bills/drafts",{method:"POST",body:{creationKey:active.creationKey,form:active.input},status:410});
  const expiring=await create();await sql(`UPDATE bills SET expires_at=0 WHERE id='${expiring.ack.id}'`);await unavailable(expiring,"bill-deleting");const maintenance=await (await api("/api/bills/maintenance",{method:"POST",body:{}})).json();assert(Object.keys(maintenance).join()==="serverNow","maintenance reveals no directory");
  const pending=await create(),pendingKey="/api/bills/"+pending.ack.editToken;await sql(`INSERT INTO bill_qr_assets (object_key,bill_id) VALUES ('bills/${pending.ack.id}/uncertain.png','${pending.ack.id}')`);assert((await (await api(pendingKey,{method:"DELETE",revision:pending.ack.revision,status:202})).json()).state==="deleting","uncertain upload not falsely complete");await unavailable(pending,"bill-deleting");await sql(`UPDATE bill_qr_assets SET put_settled=1,next_attempt_at=0 WHERE bill_id='${pending.ack.id}'; UPDATE bill_deletions SET next_attempt_at=0 WHERE id='${pending.ack.id}'`);assert((await (await api(pendingKey,{method:"DELETE",revision:pending.ack.revision})).json()).state==="deleted","settled pending cleanup completes");
  console.log("PASS built application routes, 30/7 transitions, proof/privacy, all unavailable paths, QR and replay");
 }
 console.log(`PASS ${appMode?"application":"native bindings"}: ${assertionCount} assertions`);
}finally{await stop();}
