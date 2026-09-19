
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm'), ts=require('typescript');
function setup(fail=false, rescheduled=false){
 const deleted=[], files=[];
 const now=new Date('2026-09-19T04:00:00Z');
 const docs=[{id:'old',tripId:'past',storageKey:'old.pdf',endDate:new Date('2026-09-15T12:00:00Z')},{id:'recent',tripId:'recent',storageKey:'recent.pdf',endDate:new Date('2026-09-16T12:00:00Z')},{id:'future',tripId:'future',storageKey:'future.pdf',endDate:new Date('2026-10-01T12:00:00Z')}];
 const db={document:{findMany:async ({where})=>docs.filter(d=>d.endDate<where.trip.endDate.lt),findFirst:async ({where})=>rescheduled?null:docs.find(d=>d.id===where.id && d.endDate<where.trip.endDate.lt),delete:async ({where})=>deleted.push(where.id)},$queryRaw:async()=>[]};
 db.$transaction=async cb=>cb(db);
 const context={exports:{},Date,require:n=>n==='./prisma'?{prisma:db}:{deleteDocumentFile:async key=>{files.push(key);if(fail)throw Error('storage unavailable');}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/attachment-retention.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,context);
 return {...context.exports,deleted,files,now};
}
test('retention waits three complete calendar days, including month boundaries',()=>{
 const s=setup();assert.equal(s.attachmentCutoff(s.now).toISOString(),'2026-09-16T00:00:00.000Z');
 assert.equal(s.attachmentCutoff(new Date('2026-03-02T04:00:00Z')).toISOString(),'2026-02-27T00:00:00.000Z');
});
test('only expired completed-trip attachments are removed',async()=>{
 const s=setup();await s.cleanupExpiredAttachments(s.now);
 assert.deepEqual(s.deleted,['old']);assert.deepEqual(s.files,['old.pdf']);
});
test('storage failure keeps the record for retry',async()=>{
 const s=setup(true);const result=await s.cleanupExpiredAttachments(s.now);
 assert.equal(result.failed,1);assert.deepEqual(s.deleted,[]);
});
test('rescheduling before lock recheck protects attachments',async()=>{
 const s=setup(false,true);await s.cleanupExpiredAttachments(s.now);assert.deepEqual(s.files,[]);
});
