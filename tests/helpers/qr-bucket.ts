/** Controlled R2 side effects for deterministic failures/races; native R2 is tested separately. */
export function qrBucket(){
  const objects=new Map<string,Uint8Array>();
  const hooks:{beforePut?:()=>Promise<void>;beforeDelete?:()=>Promise<void>;beforeListReturn?:()=>Promise<void>;failDelete?:boolean;failList?:boolean}={};
  const deleted:string[][]=[];
  const metadata=(key:string)=>({key,size:objects.get(key)?.length??0,version:"v1",etag:"etag",httpEtag:'"etag"',uploaded:new Date(),checksums:{},storageClass:"Standard"});
  const bucket={
    async put(key:string,value:ArrayBuffer){await hooks.beforePut?.();objects.set(key,new Uint8Array(value));return metadata(key);},
    async get(key:string){return objects.has(key)?{...metadata(key),body:new Blob([objects.get(key)!.slice()]).stream(),httpMetadata:{contentType:"image/png"}}:null;},
    async delete(input:string|string[]){await hooks.beforeDelete?.();if(hooks.failDelete)throw new Error("synthetic-r2-failure");const keys=typeof input==="string"?[input]:input;deleted.push(keys);keys.forEach(key=>objects.delete(key));},
    async list(options:R2ListOptions={}){
      if(hooks.failList)throw new Error("synthetic-list-failure");
      const keys=[...objects.keys()].filter(key=>key.startsWith(options.prefix??"")&&(!options.cursor||key>options.cursor)).sort();
      const page=keys.slice(0,options.limit??1000),truncated=keys.length>page.length;
      await hooks.beforeListReturn?.();
      return {objects:page.map(metadata),delimitedPrefixes:[],truncated,...(truncated?{cursor:page.at(-1)}:{})};
    },
  } as unknown as R2Bucket;
  return {bucket,objects,hooks,deleted};
}
