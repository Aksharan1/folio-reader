// Refreshes vendor/ from node_modules: `npm run vendor`
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

copyFileSync('node_modules/epubjs/dist/epub.min.js', 'vendor/epub.min.js');
copyFileSync('node_modules/jszip/dist/jszip.min.js', 'vendor/jszip.min.js');
copyFileSync('node_modules/pdfjs-dist/build/pdf.min.mjs', 'vendor/pdf.min.mjs');
copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'vendor/pdf.worker.min.mjs');
// foliate-js ships unbundled; its MOBI/KF8 parser is a single dependency-free module
const { version } = JSON.parse(readFileSync('node_modules/foliate-js/package.json', 'utf8'));
writeFileSync('vendor/foliate-mobi.js',
  `// mobi.js from foliate-js ${version} (MIT, https://github.com/johnfactotum/foliate-js)\n` +
  readFileSync('node_modules/foliate-js/mobi.js', 'utf8'));

// node-unrar-js (CBR comics) ships ES modules with extensionless imports, which a browser can't
// follow, so its few in-memory modules are joined into one. The .wasm is loaded by convert.js.
const unrarDir = 'node_modules/node-unrar-js/esm/js/';
const unrarVersion = JSON.parse(readFileSync('node_modules/node-unrar-js/package.json', 'utf8')).version;
const strip = (file) => readFileSync(unrarDir + file, 'utf8')
  .replace(/^import .*$/gm, '').replace(/^export default Module;$/m, '').replace(/^export /gm, '')
  .replace(/^\/\/# sourceMappingURL=.*$/gm, '');
// Emscripten names some functions by evaluating a string, which the app's Content-Security-Policy
// rightly blocks; a plain function with its name set does the same job
const NAMED_FN = 'function createNamedFunction(name,body){name=makeLegalFunctionName(name);return new Function("body","return function "+name+"() {\\n"+\'    "use strict";\'+"    return body.apply(this, arguments);\\n"+"};\\n")(body)}';
// and builds each call into C++ as generated code, which this closure does directly
const INVOKER = /function craftInvokerFunction\([\s\S]*?return invokerFunction\}/;
const INVOKER_NO_EVAL = `function craftInvokerFunction(humanName,argTypes,classType,cppInvokerFunc,cppTargetFunc){
  var argCount=argTypes.length;
  if(argCount<2){throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!")}
  var isClassMethodFunc=argTypes[1]!==null&&classType!==null;
  var needsDestructorStack=false;
  for(var i=1;i<argTypes.length;++i){if(argTypes[i]!==null&&argTypes[i].destructorFunction===undefined){needsDestructorStack=true;break}}
  var returns=argTypes[0].name!=="void";
  var first=isClassMethodFunc?2:1;
  return createNamedFunction(humanName,function(){
    if(arguments.length!==argCount-2){throwBindingError("function "+humanName+" called with "+arguments.length+" arguments, expected "+(argCount-2)+" args!")}
    var destructors=needsDestructorStack?[]:null;
    var wired=[cppTargetFunc];
    if(isClassMethodFunc)wired.push(argTypes[1].toWireType(destructors,this));
    for(var i=0;i<argCount-2;++i)wired.push(argTypes[i+2].toWireType(destructors,arguments[i]));
    var rv=cppInvokerFunc.apply(null,wired);
    if(needsDestructorStack)runDestructors(destructors);
    else for(var j=isClassMethodFunc?1:2;j<argTypes.length;++j){if(argTypes[j].destructorFunction!==null)argTypes[j].destructorFunction(wired[j===1?1:first+j-2])}
    if(returns)return argTypes[0].fromWireType(rv);
  });
}`;
const unrarJs = strip('unrar.js');
if (!unrarJs.includes(NAMED_FN) || !INVOKER.test(unrarJs)) throw new Error('node-unrar-js changed: check vendor/unrar.js for new Function / eval');
writeFileSync('vendor/unrar.js', [
  `// node-unrar-js ${unrarVersion} (MIT, https://github.com/YuJianrong/node-unrar.js), built from RARLAB's UnRAR source`,
  unrarJs
    .replace(NAMED_FN, 'function createNamedFunction(name,body){var f=function(){return body.apply(this,arguments)};Object.defineProperty(f,"name",{value:makeLegalFunctionName(name)});return f}')
    .replace(INVOKER, () => INVOKER_NO_EVAL),
  strip('ExtractorData.helper.js'),
  strip('Extractor.js'),
  strip('ExtractorData.js'),
  `let unrar;
export async function createExtractorFromData({ wasmBinary, data, password = '' }) {
  if (!unrar) unrar = await Module(wasmBinary && { wasmBinary });
  const extractor = new ExtractorData(unrar, data, password);
  unrar.extractor = extractor;
  return extractor;
}
export { UnrarError };`,
].join('\n'));
copyFileSync(unrarDir + 'unrar.wasm', 'vendor/unrar.wasm');
console.log('vendor/ updated');
