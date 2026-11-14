import qrcode from './vendor/qrcode.mjs';
import {encodePng} from './hidden-qr.mjs';
export async function localQrPng(target){
 const qr=qrcode(0,'H');qr.addData(target);qr.make();
 const count=qr.getModuleCount(),total=count+8,scale=Math.max(1,Math.floor(1024/total)),side=total*scale;
 const pixels=new Uint8Array(side*side*4);pixels.fill(255);
 for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(qr.isDark(y,x))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const i=(((y+4)*scale+dy)*side+(x+4)*scale+dx)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;}
 return new Uint8Array(await (await encodePng(pixels,side,side)).arrayBuffer());
}
