import {DatabaseSync,type SQLInputValue} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {createOpaqueToken,hashToken} from "../../lib/harn-tee/tokens";
import type {BillDocument} from "../../lib/harn-tee/types";

/** Real SQLite SQL/transaction checks; real Cloudflare D1/R2 still have a separate native gate. */
export function sqliteBillDb(legacyOnly=false){
  const sqlite=new DatabaseSync(":memory:"),applied=new Set<string>();
  const queries:Array<{sql:string;values:unknown[]}>=[];
  function migrate(includeRetention=true){
    for(const name of readdirSync("drizzle").filter(name=>name.endsWith(".sql")).sort()){
      if(applied.has(name)||!includeRetention&&name!=="0000_low_speed.sql")continue;
      sqlite.exec(readFileSync("drizzle/"+name,"utf8"));applied.add(name);
    }
  }
  migrate(!legacyOnly);
  function prepare(sql:string,values:SQLInputValue[]=[]){
    // node:sqlite treats ?1 as a named parameter; D1.bind uses positional values.
    const numbered=/\?\d+/.test(sql),named=Object.fromEntries(values.map((value,index)=>["?"+(index+1),value]));
    return {
      bind(...args:SQLInputValue[]){return prepare(sql,args);},
      async first<T>(column?:string):Promise<T|null>{const statement=sqlite.prepare(sql),row=numbered?statement.get(named):statement.get(...values);return row?(column?row[column]:row) as T:null;},
      async all<T>(){const statement=sqlite.prepare(sql);return {success:true,results:(numbered?statement.all(named):statement.all(...values)) as T[],meta:{changes:0}};},
      async run(){queries.push({sql,values});const statement=sqlite.prepare(sql),result=numbered?statement.run(named):statement.run(...values);return {success:true,results:[],meta:{changes:Number(result.changes)}};},
    };
  }
  const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){
    sqlite.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec("COMMIT");return results;}catch(error){sqlite.exec("ROLLBACK");throw error;}
  }} as unknown as D1Database;
  async function seed(document:BillDocument,id:string=crypto.randomUUID()){
    const editToken=createOpaqueToken(),shareToken=createOpaqueToken();
    sqlite.prepare("INSERT INTO bills (id,share_token_digest,edit_token_digest,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(id,await hashToken(shareToken),await hashToken(editToken),JSON.stringify(document),document.createdAt,document.updatedAt);
    return {id,editToken,shareToken};
  }
  return {db,sqlite,queries,seed,migrate,close:()=>sqlite.close()};
}
