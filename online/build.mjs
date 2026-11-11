import {readFile,writeFile,mkdir} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
const worker=await readFile('worker.mjs','utf8');const lottery=await readFile('lottery.mjs','utf8');const pages=await readFile('pages.mjs','utf8');
await writeFile('dist/server/index.js',lottery.replaceAll('export function','function')+'\n'+pages.replaceAll('export const','const')+'\n'+worker.replace(/^import .*;\n/gm,''));
await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json','utf8'));
