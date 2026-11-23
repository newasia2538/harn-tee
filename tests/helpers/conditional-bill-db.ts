export type TestBillRow={id:string;share_token_digest:string;edit_token_digest:string;payload_json:string;created_at:number;updated_at:number};
export function conditionalBillDb(){
  const rows=new Map<string,TestBillRow>();
  const queries:Array<{sql:string;values:unknown[]}>=[];
  const hooks:{afterUpdate?: (row:TestBillRow)=>void}={};
  const db={prepare(sql:string){return {bind(...values:unknown[]){return {
    async first(){const column=sql.includes("WHERE share_token_digest")?"share_token_digest":"edit_token_digest";const row=[...rows.values()].find(row=>row[column]===values[0]);return row?structuredClone(row):null;},
    async run(){
      queries.push({sql,values});
      if(sql.startsWith("INSERT")){
        const [id,share,edit,payload,created,updated]=values as [string,string,string,string,number,number];
        if(rows.has(id)||[...rows.values()].some(row=>row.edit_token_digest===edit||row.share_token_digest===share))return {success:true,meta:{changes:0}};
        rows.set(id,{id,share_token_digest:share,edit_token_digest:edit,payload_json:payload,created_at:created,updated_at:updated});return {success:true,meta:{changes:1}};
      }
      if(sql.startsWith("UPDATE")&&sql.includes("AND payload_json =")){
        const [payload,updated,share,id,oldPayload,oldShare]=values as [string,number,string,string,string,string];
        const row=rows.get(id);
        if(!row||row.payload_json!==oldPayload||row.share_token_digest!==oldShare||(sql.includes("json_extract")&&JSON.parse(row.payload_json).status!=="draft"))return {success:true,meta:{changes:0}};
        const changed={...row,payload_json:payload,updated_at:updated,share_token_digest:share};rows.set(id,changed);hooks.afterUpdate?.(changed);return {success:true,meta:{changes:1}};
      }
      if(sql==="UPDATE bills SET payload_json = ?1, updated_at = ?2 WHERE id = ?3"){
        const [payload,updated,id]=values as [string,number,string],row=rows.get(id);if(!row)return {success:true,meta:{changes:0}};
        rows.set(id,{...row,payload_json:payload,updated_at:updated});return {success:true,meta:{changes:1}};
      }
      throw new Error("Unexpected SQL in conditional database adapter");
    },
  };}};}};
  return {db,rows,queries,hooks};
}
