import {sqliteBillDb} from "./sqlite-bill-db";
import type {SQLInputValue} from "node:sqlite";
export type TestBillRow={id:string;share_token_digest:string;edit_token_digest:string;payload_json:string;created_at:number;updated_at:number;last_activity_at?:number|null;all_paid_at?:number|null;expires_at?:number|null;retention_version?:number};
/** Preserve old fixtures' mutable-row seam while exercising the real emitted SQL. */
export function conditionalBillDb(){
  const native=sqliteBillDb(),hooks:{afterUpdate?:(row:TestBillRow)=>void}={};
  const keys=["id","share_token_digest","edit_token_digest","payload_json","created_at","updated_at","last_activity_at","all_paid_at","expires_at","retention_version"];
  function tracked(row:TestBillRow){return new Proxy(row,{set(target,key,value){
    if(typeof key!=="string"||!keys.includes(key))throw new Error("Unknown test row column");
    native.sqlite.prepare("UPDATE bills SET "+key+"=? WHERE id=?").run(value,target.id);return Reflect.set(target,key,value);
  }});}
  const rows={
    get(id:string){const row=native.sqlite.prepare("SELECT * FROM bills WHERE id=?").get(id);return row?tracked(row as TestBillRow):undefined;},
    set(id:string,row:TestBillRow){const normalized={last_activity_at:null,all_paid_at:null,expires_at:null,retention_version:0,...row,id};native.sqlite.prepare("INSERT OR REPLACE INTO bills ("+keys.join(",")+") VALUES ("+keys.map(()=>"?").join(",")+")").run(...keys.map(key=>normalized[key as keyof typeof normalized]??null));return rows;},
    get size(){return Number(native.sqlite.prepare("SELECT COUNT(*) AS n FROM bills").get()!.n);},
    has(id:string){return Boolean(this.get(id));},
    values(){return (native.sqlite.prepare("SELECT * FROM bills").all() as TestBillRow[]).map(tracked).values();},
    delete(id:string){return Number(native.sqlite.prepare("DELETE FROM bills WHERE id=?").run(id).changes)>0;},
  };
  native.hooks.afterRun=(sql:string,values:SQLInputValue[],changes:number)=>{
    if(changes!==1||!sql.startsWith("UPDATE bills SET payload_json"))return;
    const match=sql.match(/WHERE id = \?(\d+)/);if(!match)return;
    const row=rows.get(String(values[Number(match[1])-1]));if(row)hooks.afterUpdate?.(row);
  };
  return {db:native.db,rows,queries:native.queries,hooks,close:native.close};
}
