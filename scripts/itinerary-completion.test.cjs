const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function api({allowed=true,signedIn=true,notifyFails=false}={}){
 const row={id:'activity',tripId:'trip',title:'Titolo',place:'Museo',day:2,sortOrder:7,time:'',latitude:0,longitude:0,done:false};
 let stored={...row},writes=0,notifications=0;
 const tx={activity:{updateMany:async({where,data})=>{assert.deepEqual(Object.keys(data),['done']);if(where.id!==stored.id||where.tripId!==stored.tripId)return{count:0};writes++;stored={...stored,...data};return{count:1};}}};
 const deps={'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},'../../../../../lib/auth':{currentUser:async()=>signedIn?{id:'user',name:'Test'}:null},'../../../../../lib/trip-access':{tripAccess:async()=>({allowed,role:'participant'})},'../../../../../lib/activity-order-storage':{},'../../../../../lib/prisma':{prisma:{$transaction:async fn=>{const previous={...stored};try{return await fn(tx);}catch(e){stored=previous;throw e;}}}},'../../../../../lib/notifications':{notifyTripMembers:async(id,actor,data,db)=>{assert.equal(db,tx);if(notifyFails)throw Error('notification failed');notifications++;}}};
 const context={exports:{},require:n=>deps[n]};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/trips/[id]/sync/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,context);
 return{patch:body=>context.exports.PATCH({json:async()=>body},{params:Promise.resolve({id:'trip'})}),read:()=>({...stored}),row,counts:()=>({writes,notifications})};
}
test('confirmed participant completes and reopens using only the done column',async()=>{
 const h=api();assert.equal((await h.patch({activityId:'activity',done:true})).status,200);assert.equal(h.read().done,true);
 for(const key of Object.keys(h.row).filter(k=>k!=='done'))assert.equal(h.read()[key],h.row[key]);
 assert.equal((await h.patch({activityId:'activity',done:false})).status,200);assert.equal(h.read().done,false);assert.equal(h.counts().notifications,2);
});
test('completion rejects unauthenticated users, unauthorized users and out-of-trip IDs',async()=>{
 assert.equal((await api({signedIn:false}).patch({activityId:'activity',done:true})).status,401);
 const denied=api({allowed:false});assert.equal((await denied.patch({activityId:'activity',done:true})).status,403);assert.equal(denied.counts().writes,0);
 const other=api();assert.equal((await other.patch({activityId:'other-trip-activity',done:true})).status,404);assert.equal(other.counts().writes,0);assert.equal(other.counts().notifications,0);
});
test('completion cannot mutate titles, order or other fields through an extra payload',async()=>{
 for(const body of [{activityId:'activity',done:'true'},{activityId:'activity',done:true,title:'Injected'},{activityId:'activity',done:true,sortOrder:99},null]){const h=api();assert.equal((await h.patch(body)).status,400);assert.equal(h.counts().writes,0);}
});
test('a failed notification rolls back the database toggle, making client rollback consistent',async()=>{
 const h=api({notifyFails:true});assert.equal((await h.patch({activityId:'activity',done:true})).status,503);assert.equal(h.read().done,false);
});
