import {readFile,writeFile,mkdir} from 'node:fs/promises';
const read=name=>readFile(name,'utf8');
const strip=s=>s.replace(/^import[^\r\n]*;\r?\n/gm,'').replaceAll('export const','const').replaceAll('export function','function').replaceAll('export async function','async function');
const assets=Object.fromEntries(await Promise.all(['index.html','admin.html','poster.html','hidden-qr.mjs'].map(async n=>['/app/'+n,await read(n)])));
// Reuse the production Windows handlers; replace only process and filesystem edges.
let app=await read('windows-server.mjs');app=app.replace(/^import[^\r\n]*;\r?\n/gm,'');
app=app.replace('const chooseEntry=createEntrySelector();','');
const start=app.indexOf('const root=');const session=app.indexOf('async function check()');
app=app.slice(0,start)+`const root='/app',dir='/app/data',historyDir=dir+'/history',settingsFile=dir+'/settings.json';\nlet settings={afterText:'',pageTitle:'',redirectEnabled:true,...displayDefaults};try{const stored=JSON.parse(await readFile(settingsFile,'utf8'));settings={...settings,...stored}}catch(e){if(e.code!=='ENOENT')throw e}\nconst password=env.ADMIN_PASSWORD;if(!password)return new Response('Backend is not configured',{status:503});\nconst sessions=persistentMap(env.BUCKET,'sessions/'),attempts=persistentMap(env.BUCKET,'attempts/');let cache=null,inflight=null;\n`+app.slice(session);
app=app.replace('const historyLocks=new Map();','');
const equalStart=app.indexOf('function equal(a,b)');const handler=app.indexOf('const server=http.createServer',equalStart);app=app.slice(0,equalStart)+app.slice(handler);
app=app.replace('const server=http.createServer(async(req,res)=>{try{','await (async()=>{try{');
app=app.slice(0,app.indexOf('\nsetInterval(()=>'));
app=app.replace(/randomBytes\((\d+)\)\.toString\('hex'\)/g,'randomToken($1)');
app=app.replaceAll('Buffer.from(await out.arrayBuffer())','new Uint8Array(await out.arrayBuffer())').replaceAll('Buffer.from(await result.arrayBuffer())','new Uint8Array(await result.arrayBuffer())').replaceAll('Buffer.byteLength(str)','encoder.encode(str).length');
app=app.replace('session=sessions.get(cookie)','session=await sessions.get(cookie)').replace('entry=attempts.get(ip)','entry=await attempts.get(ip)');
app=app.replaceAll('sessions.set(','await sessions.set(').replaceAll('sessions.delete(','await sessions.delete(').replaceAll('attempts.set(','await attempts.set(').replaceAll('attempts.delete(','await attempts.delete(');
// Node's createServer wrapper ends in }); instead of the invoked async closure.
if(!app.trimEnd().endsWith('});'))throw Error('Unexpected server wrapper');app=app.trimEnd().slice(0,-3)+'})();\nreturn res.response||new Response("No response",{status:500});';
const adapter=await read('worker-adapter.mjs');
const prefix=[await read('lottery.mjs'),await read('display-control.mjs'),await read('entry-routing.mjs'),await read('browser-open.mjs'),await read('poster-service.mjs')].map(strip).join('\n');
const worker=prefix+'\n'+strip(adapter)+'\nconst chooseEntry=createEntrySelector();\nconst assets='+JSON.stringify(assets)+';\nexport default {async fetch(original,env){try{const migration=await migrationRoute(original,env);if(migration)return migration;const {readFile,writeFile,rename,mkdir,readdir,unlink}=filesystem(env,assets);const req=requestAdapter(original),res=responseAdapter();const Readable={toWeb:()=>original.body};\n'+app+'\n}catch{return Response.json({error:"服务暂时不可用，请稍后重试"},{status:500,headers:{"Cache-Control":"no-store"}})}}};\n';
if(/node:|\bBuffer\.|\brandomBytes\(/.test(worker))throw Error('Unported Node dependency');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});await writeFile('dist/server/index.js',worker);await writeFile('dist/.openai/hosting.json',await read('.openai/hosting.json'));
console.log('Built migrated Worker with production handlers and persistent private R2 data');
