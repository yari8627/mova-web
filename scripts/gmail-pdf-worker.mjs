import {inflateSync} from 'node:zlib';
import {parentPort,workerData} from 'node:worker_threads';
// No URLs, rendering, active content, filesystem output or parser logs.
globalThis.fetch=async()=>{throw Error('network disabled');};
let phase="preflight";
try {
 const raw=Buffer.from(workerData).toString('latin1');let expanded=0,streams=0;
 // Bound compressed streams before handing them to the general PDF parser.
 for(const match of raw.matchAll(/<<([^]*?)>>\s*stream\r?\n([^]*?)\r?\n?endstream/g)){
  if(++streams>200)throw Error('streams');
  if(/\/Filter/.test(match[1])){
   if(/\/Filter\s*\[|\/Filter\s*\/(?!FlateDecode\b|DCTDecode\b|JPXDecode\b)/.test(match[1]))throw Error('filter');
   if(/\/FlateDecode/.test(match[1]))expanded+=inflateSync(Buffer.from(match[2],'latin1'),{maxOutputLength:2000000}).length;
   if(expanded>5000000)throw Error('expanded');
  }
 }
 phase="module_load";const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 phase="worker_setup";const task=getDocument({data:new Uint8Array(workerData),verbosity:0,isEvalSupported:false,useWasm:false,useSystemFonts:false,disableFontFace:true,enableXfa:false,useWorkerFetch:false,stopAtErrors:true,maxImageSize:0,disableAutoFetch:true,disableStream:true,disableRange:true});
 phase="document";const doc=await task.promise;
 if(doc.numPages>10){await task.destroy();parentPort.postMessage({reason:'pages'});}
 else {phase="text";let text='';for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);const stream=page.streamTextContent({disableNormalization:false});const reader=stream.getReader();let count=0;for(;;){const {value,done}=await reader.read();if(done)break;for(const item of value.items){if(++count>15000 || text.length>100000)throw Error('text limit');if('str' in item)text+=item.str+(item.hasEOL?'\n':' ');}}text+='\n';page.cleanup();}await task.destroy();parentPort.postMessage(text.trim()?{text}:{reason:'no_text'});}
}catch(e){parentPort.postMessage({reason:e?.name==='PasswordException'?'protected':phase==='preflight'?'stream_limit':phase==='module_load'?'module_load':phase==='worker_setup'?'worker_setup':e?.name==='InvalidPDFException'?'invalid_pdf':/^Setting up fake worker failed:/.test(e?.message||'')?'pdfjs_worker':e?.message==='text limit'?'text_limit':'pdf_parse'});}
