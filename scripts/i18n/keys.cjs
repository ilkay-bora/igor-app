// Collects every translation key: t()/tServer() literal arguments plus the
// module-level label strings that are translated where they are displayed.
// Prints keys missing from i18n-en.ts (with --all, every key).
const ts = require("typescript"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../../apps/studio/src");
const keys = new Map();
const LABEL_PROPS = new Set(["label", "name", "detail", "badge", "description", "hint", "title", "tone", "instruction"]);
(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.tsx?$/.test(p)&&!/i18n(-en)?\.ts$/.test(p)){
  const src=fs.readFileSync(p,"utf8");const sf=ts.createSourceFile(p,src,99,true,p.endsWith("x")?4:3);
  const rel=path.relative(ROOT,p).split(path.sep).join("/");
  (function v(n){
    if(ts.isCallExpression(n)&&/^(t|tServer)$/.test(n.expression.getText(sf))&&n.arguments[0]&&(ts.isStringLiteral(n.arguments[0])||ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))){
      const k=n.arguments[0].text; if(!keys.has(k)) keys.set(k,rel);
    }
    if(ts.isPropertyAssignment(n)&&LABEL_PROPS.has(n.name.getText(sf))&&ts.isStringLiteral(n.initializer)&&/[a-zçğıöşü]{2}/i.test(n.initializer.text)){
      let fn=false; for(let q=n.parent;q;q=q.parent) if(ts.isFunctionLike(q)) {fn=true;break;}
      if(!fn){const k=n.initializer.text; if(!keys.has(k)) keys.set(k,rel);}
    }
    ts.forEachChild(n,v);})(sf);}}})(ROOT);
let EN={};
try{const s=fs.readFileSync(path.join(ROOT,"lib/i18n-en.ts"),"utf8");EN=Function(s.replace(/^[\s\S]*?=\s*/,"return ").replace(/;\s*$/,""))();}catch(e){console.error("EN parse failed:",e.message)}
const all=process.argv.includes("--all");
const out=[...keys].filter(([k])=>all||!(k in EN));
const unused=Object.keys(EN).filter(k=>!keys.has(k));
if(process.argv.includes("--list")) for(const [k,f] of out) console.log(f+": "+JSON.stringify(k));
console.log("total keys",keys.size,"missing",out.length,"unused EN entries",unused.length);
if(process.argv.includes("--unused")) console.log(unused.join("\n"));
