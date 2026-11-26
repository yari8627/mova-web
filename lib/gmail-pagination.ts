import { mergeGmailPreviews } from "./gmail-preview";
type Row={key:string;identityKey?:string;email:{date:string}};
export type SearchTrace={request:number;durationMs:number;httpStatus:number;outcome:string;remainingCursor?:boolean;beforeDedup?:number;afterDedup?:number;server?:unknown};
type Page<T>={attachmentIssues?:Record<string,number>;remainingWork?:{gmailPage:boolean;pdfPending:number};searchStatus?:unknown;candidates:T[];nextCursor:string|null;examined:number;trips:unknown[];excluded?:Record<string,number>;duplicates?:number;attachmentsPartial?:boolean;messagesPartial?:boolean};
export function receivedOrder<T extends Row>(rows:T[]):T[]{return [...rows].sort((a,b)=>(Date.parse(b.email.date)||0)-(Date.parse(a.email.date)||0)||a.key.localeCompare(b.key));}
/** Sequential bounded pagination: no concurrent requests, no implicit retry or writes. */
export async function collectGmailPages<T extends Row>(request:(cursor:string|undefined,signal:AbortSignal)=>Promise<Page<T>>,onPage:(rows:T[],page:Page<T>)=>void,options:{maxPages?:number;timeoutMs?:number;totalMs?:number;signal?:AbortSignal;onDiagnostic?:(event:SearchTrace)=>void}={}){
 const maxPages=options.maxPages ?? 20,timeoutMs=options.timeoutMs ?? 45000,deadline=Date.now()+(options.totalMs ?? 90000);
 let rows:T[]=[],cursor:string|undefined;const seen=new Set<string>();let pages=0,attachmentsPartial=false,messagesPartial=false;const attachmentIssues:Record<string,number>={};let remainingWork={gmailPage:false,pdfPending:0};
 const finish=(result:{rows:T[];partial:boolean;reason:string;pages:number})=>({...result,attachmentIssues,remainingWork,completionState:result.reason==="complete"?(rows.length?"complete_with_results":"complete_empty"):result.reason==="attachments"?(messagesPartial?"message_failures":"attachment_failures"):remainingWork.gmailPage?"gmail_pending":remainingWork.pdfPending?"pdf_pending":"interrupted"});
 const emit=(outcome:string)=>options.onDiagnostic?.({request:pages+1,durationMs:0,httpStatus:0,outcome});
 while(pages<maxPages){
  if(options.signal?.aborted){emit("client_abort");return finish({rows,partial:true,reason:"cancelled",pages});}
  if(Date.now()>=deadline){emit("total_timeout");return finish({rows,partial:true,reason:"limit",pages});}
  const started=Date.now();let timedOut=false;const totalTimeout=deadline-started<=timeoutMs;
  const controller=new AbortController();const cancel=()=>controller.abort();options.signal?.addEventListener("abort",cancel,{once:true});let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const page=await Promise.race([request(cursor,controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{timedOut=true;controller.abort();reject(Error("timeout"));},Math.min(timeoutMs,deadline-Date.now()));})]);
   if(options.signal?.aborted){emit("client_abort");return finish({rows,partial:true,reason:"cancelled",pages});}
   attachmentsPartial ||= Boolean(page.attachmentsPartial || page.messagesPartial);messagesPartial ||= Boolean(page.messagesPartial);remainingWork=page.remainingWork || {gmailPage:Boolean(page.nextCursor),pdfPending:0};for(const [key,value] of Object.entries(page.attachmentIssues || {}))attachmentIssues[key]=(attachmentIssues[key]||0)+value;
   const beforeDedup=rows.length+page.candidates.length;rows=receivedOrder(mergeGmailPreviews(rows,page.candidates));pages++;onPage(rows,page);
   options.onDiagnostic?.({request:pages,durationMs:Date.now()-started,httpStatus:200,outcome:"response",remainingCursor:Boolean(page.nextCursor),beforeDedup,afterDedup:rows.length,server:page.searchStatus});
   if(!page.nextCursor)return finish({rows,partial:attachmentsPartial,reason:attachmentsPartial?"attachments":"complete",pages});
   if(seen.has(page.nextCursor)){emit("cursor_loop");return finish({rows,partial:true,reason:"cursor",pages});}
   seen.add(page.nextCursor);cursor=page.nextCursor;
  }catch(e){options.onDiagnostic?.({request:pages+1,durationMs:Date.now()-started,httpStatus:typeof (e as {httpStatus?:number})?.httpStatus==="number"?(e as {httpStatus:number}).httpStatus:0,outcome:options.signal?.aborted?"client_abort":timedOut?(totalTimeout?"total_timeout":"request_timeout"):"backend_error"});return finish({rows,partial:true,reason:"request",pages});}
  finally{if(timer)clearTimeout(timer);options.signal?.removeEventListener("abort",cancel);}
 }
 emit("page_limit");return finish({rows,partial:true,reason:"limit",pages});
}

/** Closed projection: never serialize API responses, exception messages or mail metadata. */
export function safeSearchTrace(event:SearchTrace){
 const number=(v:unknown)=>typeof v==="number" && Number.isFinite(v)?Math.max(0,Math.min(10000000,Math.round(v))):0;
 const server=event.server as Record<string,unknown>|undefined;
 const numeric=(value:unknown,keys:string[])=>Object.fromEntries(keys.map(k=>[k,number((value as Record<string,unknown>|undefined)?.[k])]));
 const uuid=(v:unknown)=>typeof v==="string" && /^[a-f0-9-]{36}$/i.test(v)?v:undefined;
 const outcomes=["response","client_abort","total_timeout","request_timeout","backend_error","page_limit","cursor_loop"];
 const reasons=["complete","pending","message_fetch","attachment_unreadable_or_limit"];
 return {request:number(event.request),durationMs:number(event.durationMs),httpStatus:number(event.httpStatus),outcome:outcomes.includes(event.outcome)?event.outcome:"backend_error",remainingCursor:event.remainingCursor===true,beforeDedup:number(event.beforeDedup),afterDedup:number(event.afterDedup),...(server?{server:{version:typeof server.version==="string" && /^[a-f0-9]{7,40}$/i.test(server.version)?server.version:"local",searchId:uuid(server.searchId),requestId:uuid(server.requestId),phase:server.phase==="pdf"?"pdf":"body",partialReason:reasons.includes(String(server.partialReason))?server.partialReason:"unknown",...numeric(server,["durationMs","gmailPages","messages","returned","deduplicated","pdfAttempts","pdfPending"]),remainingGmailPage:server.remainingGmailPage===true,queueOverflow:server.queueOverflow===true,timings:numeric(server.timings,["access","list","fetch","body","pdf","validationDedup"]),counts:{...numeric(server.counts,["listed","fetched","unrecognized","beforeDedup","qualityRejected","pdfProcessed","pdfSkipped","pdfFailed"]),rejectionFields:numeric((server.counts as Record<string,unknown>|undefined)?.rejectionFields,["reference","provider","place","calendar","named","uncertain"]),messageFailures:numeric((server.counts as Record<string,unknown>|undefined)?.messageFailures,["timeout","network","oversized","authorization","rate_limit","other"]),types:numeric((server.counts as Record<string,unknown>|undefined)?.types,["flight","hotel","train","car","activity"]),pdfReasons:numeric((server.counts as Record<string,unknown>|undefined)?.pdfReasons,["bytes","format","timeout","text","pages","no_text","protected","unreadable","mime_limit","budget","declared_size","download_size","attachment_fetch","module_load","worker_setup","worker_start","worker_runtime","worker_exit","invalid_pdf","pdfjs_worker","stream_limit","stream_count_limit","unsupported_filter","decoded_stream_limit","decoded_total_limit","stream_decode","stream_structure","stream_preflight","search_budget","text_limit","pdf_parse"])}}}: {})};
}
