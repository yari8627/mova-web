
const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const vm=require('node:vm');
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/expense-balances.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,context);
const calc=(expenses,people=['A','B','C','D'])=>JSON.parse(JSON.stringify(context.exports.calculateGroupBalances(expenses,people)));
const expenses=[
 {amount:240,paidBy:'A',sharedWith:['A','B','C','D']},
 {amount:170,paidBy:'A',sharedWith:['A','B']},
 {amount:29,paidBy:'B',sharedWith:['A','B','C','D']}
];
const transfers=result=>result.transfers.map(t=>t.from+'>'+t.to+':'+t.amount).sort();
test('reported example retains all five direct repayments and correct net totals',()=>{
 const result=calc(expenses);
 assert.deepEqual(transfers(result),['B>A:137.75','C>A:60','C>B:7.25','D>A:60','D>B:7.25']);
 assert.deepEqual(result.balances,[{name:'A',balance:257.75},{name:'B',balance:-123.25},{name:'C',balance:-67.25},{name:'D',balance:-67.25}]);
});
test('settlements reduce only the relevant pair and can fully clear the group',()=>{
 const partial=calc([...expenses,{amount:60,paidBy:'C',recipient:'A',kind:'settlement'}]);
 assert.deepEqual(transfers(partial),['B>A:137.75','C>B:7.25','D>A:60','D>B:7.25']);
 const payments=calc(expenses).transfers.map(t=>({amount:t.amount,paidBy:t.from,recipient:t.to,kind:'settlement'}));
 assert.deepEqual(calc([...expenses,...payments]).transfers,[]);
});
test('rounding conserves cents and supports a payer outside the split',()=>{
 const result=calc([{amount:10,paidBy:'A',sharedWith:['B','C','D']}]);
 assert.deepEqual(transfers(result),['B>A:3.34','C>A:3.33','D>A:3.33']);
 assert.equal(result.transfers.reduce((n,t)=>n+Math.round(t.amount*100),0),1000);
});
test('reciprocal debts cancel but circular debts are preserved',()=>{
 assert.deepEqual(calc([{amount:10,paidBy:'A',sharedWith:['B']},{amount:10,paidBy:'B',sharedWith:['A']}]).transfers,[]);
 assert.equal(calc([{amount:10,paidBy:'A',sharedWith:['B']},{amount:10,paidBy:'B',sharedWith:['C']},{amount:10,paidBy:'C',sharedWith:['A']}]).transfers.length,3);
});
test('overpayments reverse the same pair and historical split members are retained',()=>{
 assert.deepEqual(transfers(calc([{amount:5,paidBy:'A',sharedWith:['B']},{amount:7,paidBy:'B',recipient:'A',kind:'settlement'}])),['A>B:2']);
 assert.deepEqual(transfers(calc([{amount:12,paidBy:'A',sharedWith:['A','Former']}],['A'])),['Former>A:6']);
});
