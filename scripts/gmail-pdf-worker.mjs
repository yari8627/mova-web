import {inflateSync} from 'node:zlib';
import {parentPort,workerData} from 'node:worker_threads';
// No URLs, rendering, active content, filesystem output or parser logs.
globalThis.fetch=async()=>{throw Error('network disabled');};
let phase="preflight";
try {
 const bytes=Buffer.from(workerData),raw=bytes.toString('latin1');let expanded=0,streams=0;
 // Read PDF syntax outside streams only. Binary payload is never tokenized or
 // searched for endstream: /Length defines the exact bytes passed to zlib.
 const delimiter=c=>!c || /[\x00\t\n\f\r ()<>\[\]{}/%]/.test(c);
 function token(position){
  while(position<raw.length){if(/[\x00\t\n\f\r ]/.test(raw[position])){position++;continue;}if(raw[position]==='%'){while(position<raw.length && !/[\r\n]/.test(raw[position]))position++;continue;}break;}
  if(position>=raw.length)return null;const start=position,c=raw[position++];
  if(c==='('){let depth=1;while(position<raw.length && depth){const ch=raw[position++];if(ch==='\\')position++;else if(ch==='(')depth++;else if(ch===')')depth--;}if(depth)throw Error('stream_structure');return {value:'#string',kind:'literal',end:position};}
  if(c==='<' && raw[position]!=='<'){while(position<raw.length && raw[position]!=='>')position++;if(position===raw.length)throw Error('stream_structure');return {value:'#hex',kind:'literal',end:position+1};}
  if((c==='<' || c==='>') && raw[position]===c)return {value:c+c,kind:'syntax',end:position+1};
  if('[]{}>'.includes(c))return {value:c,kind:'syntax',end:position};
  while(position<raw.length && !delimiter(raw[position]))position++;
  const value=raw.slice(start,position);return {value:c==='/'?value.replace(/#([a-f0-9]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))):value,kind:c==='/'?'name':'word',end:position};
 }
 // Resolve scalar /Length references only through a classic xref entry: do not
 // search binary payload for object-looking strings or guess a missing length.
 function indirectLength(id,generation){
  const start=raw.match(/startxref\s+(\d+)\s+%%EOF\s*$/);if(!start)throw Error('stream_structure');
  let at=Number(start[1]);let t=token(at);if(t?.value!=='xref')throw Error('stream_structure');at=t.end;
  for(;;){const first=token(at);if(!first || first.value==='trailer')break;const count=token(first.end);if(!/^\d+$/.test(first.value) || !/^\d+$/.test(count?.value||''))throw Error('stream_structure');at=count.end;
   const n=Number(count.value);if(n>raw.length/4)throw Error('stream_structure');
   for(let i=0;i<n;i++){const offset=token(at),gen=token(offset?.end),status=token(gen?.end);if(!offset || !gen || !status)throw Error('stream_structure');at=status.end;
    if(Number(first.value)+i===id){if(status.value!=='n' || Number(gen.value)!==generation)throw Error('stream_structure');const obj=token(Number(offset.value)),g=token(obj?.end),keyword=token(g?.end),value=token(keyword?.end),end=token(value?.end);if(Number(obj?.value)!==id || Number(g?.value)!==generation || keyword?.value!=='obj' || !/^\d+$/.test(value?.value||'') || end?.value!=='endobj')throw Error('stream_structure');return Number(value.value);}
   }
  }throw Error('stream_structure');
 }
 function streamDictionary(values){
  let length,filter=null,arrayDepth=0;
  for(let i=0;i<values.length;i++){
   const t=values[i];if(t.value==='['){arrayDepth++;continue;}if(t.value===']'){arrayDepth--;continue;}if(arrayDepth || t.kind!=='name')continue;
   if(t.value==='/Length'){
    if(length!==undefined || !/^\+?\d+$/.test(values[i+1]?.value||''))throw Error('stream_structure');
    if(values[i+3]?.value==='R'){if(!/^\d+$/.test(values[i+2]?.value||''))throw Error('stream_structure');length=indirectLength(Number(values[i+1].value),Number(values[i+2].value));}else length=Number(values[i+1].value);
   }
   if(t.value==='/Filter'){
    if(filter!==null)throw Error('stream_structure');const v=values[i+1];
    if(v?.kind==='name')filter=v.value.slice(1);
    else if(v?.value==='[' && values[i+2]?.kind==='name' && values[i+3]?.value===']')filter=values[i+2].value.slice(1);
    else throw Error('unsupported_filter');
   }
  }
  if(!Number.isSafeInteger(length) || length<0)throw Error('stream_structure');
  if(filter!==null && !['FlateDecode','DCTDecode','JPXDecode'].includes(filter))throw Error('unsupported_filter');
  return {length,filter};
 }
 let position=0,lastDictionary=null;const stack=[];
 for(;;){const t=token(position);if(!t)break;position=t.end;
  if(t.value==='<<'){if(stack.length>=64)throw Error('stream_structure');stack.push([]);lastDictionary=null;continue;}
  if(t.value==='>>'){if(!stack.length)throw Error('stream_structure');lastDictionary=stack.pop();if(stack.length)stack.at(-1).push({value:'#dictionary',kind:'literal'});continue;}
  if(t.value==='stream' && t.kind==='word'){
   if(stack.length || !lastDictionary)throw Error('stream_structure');if(++streams>200)throw Error('stream_count_limit');
   const {length,filter}=streamDictionary(lastDictionary);let begin=position;while(raw[begin]===' ' || raw[begin]==='\t')begin++;
   if(raw[begin]==='\r' && raw[begin+1]==='\n')begin+=2;else if(raw[begin]==='\r' || raw[begin]==='\n')begin++;else throw Error('stream_structure');
   const end=begin+length;if(end>raw.length)throw Error('stream_structure');const ending=token(end);if(ending?.value!=='endstream' || ending.kind!=='word')throw Error('stream_structure');
   if(filter==='FlateDecode'){
    try{expanded+=inflateSync(bytes.subarray(begin,end),{maxOutputLength:2000000}).length;}
    catch(e){throw Error(e?.code==='ERR_BUFFER_TOO_LARGE'?'decoded_stream_limit':'stream_decode');}
   }
   if(expanded>5000000)throw Error('decoded_total_limit');position=ending.end;lastDictionary=null;continue;
  }
  if(stack.length)stack.at(-1).push(t);lastDictionary=null;
 }
 phase="module_load";const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 phase="worker_setup";const task=getDocument({data:new Uint8Array(workerData),verbosity:0,isEvalSupported:false,useWasm:false,useSystemFonts:false,disableFontFace:true,enableXfa:false,useWorkerFetch:false,stopAtErrors:true,maxImageSize:0,disableAutoFetch:true,disableStream:true,disableRange:true});
 phase="document";const doc=await task.promise;
 if(doc.numPages>10){await task.destroy();parentPort.postMessage({reason:'pages'});}
 else {phase="text";let text='';for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);const stream=page.streamTextContent({disableNormalization:false});const reader=stream.getReader();let count=0;for(;;){const {value,done}=await reader.read();if(done)break;for(const item of value.items){if(++count>15000 || text.length>100000)throw Error('text limit');if('str' in item)text+=item.str+(item.hasEOL?'\n':' ');}}text+='\n';page.cleanup();}await task.destroy();parentPort.postMessage(text.trim()?{text}:{reason:'no_text'});}
}catch(e){parentPort.postMessage({reason:e?.name==='PasswordException'?'protected':phase==='preflight'?(['stream_count_limit','unsupported_filter','decoded_stream_limit','decoded_total_limit','stream_decode','stream_structure'].includes(e?.message)?e.message:'stream_preflight'):phase==='module_load'?'module_load':phase==='worker_setup'?'worker_setup':e?.name==='InvalidPDFException'?'invalid_pdf':/^Setting up fake worker failed:/.test(e?.message||'')?'pdfjs_worker':e?.message==='text limit'?'text_limit':'pdf_parse'});}
