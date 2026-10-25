const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path'), ts=require('typescript');
function load(file, globals={}, dependencies={}) {
  const cache=new Map();
  function read(file) { file=path.resolve(file);if(cache.has(file))return cache.get(file);
    const context={exports:{},URL,URLSearchParams,AbortController,AbortSignal,setTimeout,clearTimeout,Date,...globals};cache.set(file,context.exports);
    context.require=name=>name in dependencies?dependencies[name]:name.startsWith('.')?read(path.resolve(path.dirname(file),name+'.ts')):require(name);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,esModuleInterop:true}}).outputText,context);
    return context.exports;
  }
  return read(file);
}
module.exports={load};
