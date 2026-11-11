import {readFile,writeFile,mkdir} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
const worker=await readFile('worker.mjs','utf8');const lottery=await readFile('lottery.mjs','utf8');const pages=await readFile('pages.mjs','utf8');
const poster=await readFile('poster-service.mjs','utf8');
const posterViews='const posterHtml='+JSON.stringify(await readFile('poster.html','utf8'))+';\nconst hiddenQrCode='+JSON.stringify(await readFile('hidden-qr.mjs','utf8'))+';\n';
await writeFile('dist/server/index.js',lottery.replaceAll('export function','function')+'\n'+pages.replaceAll('export const','const')+'\n'+posterViews+poster.replaceAll('export const','const').replaceAll('export async function','async function')+'\n'+worker.replace(/^import[^\r\n]*;\r?\n/gm,''));
await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json','utf8'));
