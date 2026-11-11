export function browserOpenResponse(url, ua='',enabled=true) {
 const raw=url.searchParams.get('target')||'https://svitla.it.com/';let target;
 try{target=new URL(raw);if(!['http:','https:'].includes(target.protocol)||target.username||target.password||target.href.length>900)throw Error()}catch{return new Response('无效的目标网址',{status:400})}
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};
 const wechat=/MicroMessenger/i.test(ua),ios=/iPhone|iPad|iPod/i.test(ua);
 if(!enabled||!wechat)return new Response(null,{status:302,headers:{...headers,Location:target.href}});
 if(!ios)return new Response('请使用浏览器打开此页面。',{headers:{...headers,'Content-Disposition':'attachment; filename="a.doc"','Content-Type':'application/vnd.ms-word; charset=utf-8'}});
 const safe=target.href.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>在浏览器打开</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#f5f6f8;margin:0;padding:32px 20px;color:#17202b}main{max-width:480px;margin:40px auto;background:white;padding:24px;border-radius:14px}h1{font-size:23px}input{box-sizing:border-box;width:100%;padding:12px;font:inherit}button{margin-top:16px;background:#185bdb;color:white;border:0;border-radius:8px;padding:12px 20px;font:inherit}</style><main><h1>请使用浏览器打开</h1><p>点击微信右上角的“···”，选择“在浏览器打开”或“在 Safari 中打开”。</p><p>也可以点击下方按钮复制链接，再到 Safari 粘贴打开。</p><input id="url" type="hidden" value="${safe}"><button id="copy">复制网址</button><p id="status" role="status"></p></main><script>document.getElementById('copy').onclick=async()=>{const input=document.getElementById('url');try{await navigator.clipboard.writeText(input.value);document.getElementById('status').textContent='网址已复制'}catch{document.getElementById('status').textContent='请点击微信右上角，选择在浏览器打开'}};</script></html>`;
 return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'"}});
}
