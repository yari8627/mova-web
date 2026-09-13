
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const vm=require('node:vm');
function load(path,deps={}){const context={exports:{},require:n=>deps[n]};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,context);return context.exports;}
const balances=load('lib/expense-balances.ts');
const {reconcileExpenseIdentities:reconcile}=load('lib/expense-identities.ts',{'./expense-balances':balances});
test('accepted invite merges old and new labels in splits, payers and settlements',()=>{
 const people=[{name:'Owner',email:'a@test.it'},{name:'Vania',email:'v@test.it'}];
 const invites=[{name:'V Fperformance',email:'V@Test.it'}];
 const result=reconcile([
 {amount:100,paidBy:'Owner',sharedWith:JSON.stringify(['Owner','V Fperformance','Vania'])},
 {amount:10,paidBy:'V Fperformance',recipient:'Owner',kind:'settlement'},
 {amount:10,paidBy:'Owner',recipient:'V Fperformance',kind:'settlement'}
 ],people,invites);
 assert.deepEqual(JSON.parse(result[0].sharedWith),['Owner','Vania']);
 assert.equal(result[1].paidBy,'Vania');
 assert.equal(result[2].recipient,'Vania');
 const transfers=balances.calculateGroupBalances(result,['Owner','Vania']).transfers;
 assert.equal(transfers.length,1);
 assert.equal(transfers[0].from,'Vania');
 assert.equal(transfers[0].amount,50);
 assert.equal(reconcile(result,people,invites)[0].sharedWith,result[0].sharedWith);
});
test('ambiguous names and unrelated former participants are not merged',()=>{
 const result=reconcile([{paidBy:'Alex',sharedWith:'["Former"]'}],[{name:'Alessio',email:'a@test.it'},{name:'Alex',email:'b@test.it'}],[{name:'Alex',email:'a@test.it'}]);
 assert.equal(result[0].paidBy,'Alex');
 assert.equal(result[0].sharedWith,'["Former"]');
});
