import { mergeGmailPreviews } from "./gmail-preview";
type Row={key:string;identityKey?:string;email:{date:string}};
type Page<T>={candidates:T[];nextCursor:string|null;examined:number;trips:unknown[];excluded?:Record<string,number>;duplicates?:number};
export function receivedOrder<T extends Row>(rows:T[]):T[]{return [...rows].sort((a,b)=>(Date.parse(b.email.date)||0)-(Date.parse(a.email.date)||0)||a.key.localeCompare(b.key));}
/** Sequential bounded pagination: no concurrent requests, no implicit retry or writes. */
export async function collectGmailPages<T extends Row>(request:(cursor:string|undefined,signal:AbortSignal)=>Promise<Page<T>>,onPage:(rows:T[],page:Page<T>)=>void,options:{maxPages?:number;timeoutMs?:number;totalMs?:number;signal?:AbortSignal}={}){
 const maxPages=options.maxPages ?? 20,timeoutMs=options.timeoutMs ?? 20000,deadline=Date.now()+(options.totalMs ?? 90000);
 let rows:T[]=[],cursor:string|undefined;const seen=new Set<string>();let pages=0;
 while(pages<maxPages){
  if(options.signal?.aborted)return {rows,partial:true,reason:"cancelled",pages};
  if(Date.now()>=deadline)return {rows,partial:true,reason:"limit",pages};
  const controller=new AbortController();const cancel=()=>controller.abort();options.signal?.addEventListener("abort",cancel,{once:true});let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const page=await Promise.race([request(cursor,controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("timeout"));},Math.min(timeoutMs,deadline-Date.now()));})]);
   if(options.signal?.aborted)return {rows,partial:true,reason:"cancelled",pages};
   rows=receivedOrder(mergeGmailPreviews(rows,page.candidates));pages++;onPage(rows,page);
   if(!page.nextCursor)return {rows,partial:false,reason:"complete",pages};
   if(seen.has(page.nextCursor))return {rows,partial:true,reason:"cursor",pages};
   seen.add(page.nextCursor);cursor=page.nextCursor;
  }catch{return {rows,partial:true,reason:"request",pages};}
  finally{if(timer)clearTimeout(timer);options.signal?.removeEventListener("abort",cancel);}
 }
 return {rows,partial:true,reason:"limit",pages};
}
