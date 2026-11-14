export function composeHidden(base,width,height,qr,qrWidth,qrHeight,settings){
 if(base.length!==width*height*4||qr.length!==qrWidth*qrHeight*4)throw Error('图片数据不完整');
 const isDark=(x,y)=>qr[(y*qrWidth+x)*4]<128;
 let top=-1,left=-1;
 for(let y=0;y<qrHeight&&top<0;y++)for(let x=0;x<qrWidth;x++)if(isDark(x,y)){top=y;left=x;break}
 if(top<0)throw Error('二维码图片无效');let run=0;while(left+run<qrWidth&&isDark(left+run,top))run++;
 const modules=Math.round(qrWidth/(run/7));
 if(modules<29||modules>185||(modules-29)%4!==0)throw Error('无法确认二维码点阵，请重新生成');
 const unit=Math.max(2,Math.round(Math.min(width,height)*settings.size/100/modules));
 const side=unit*modules;if(side>Math.min(width,height))throw Error('底图太小，请上传更大的图片');
 const x=Math.round((width-side)*settings.x/100),y=Math.round((height-side)*settings.y/100);
 const data=new Uint8Array(base);for(let i=3;i<data.length;i+=4)data[i]=255;
 for(let dy=0;dy<side;dy++)for(let dx=0;dx<side;dx++){
  const qx=Math.floor((Math.floor(dx/unit)+.5)*qrWidth/modules),qy=Math.floor((Math.floor(dy/unit)+.5)*qrHeight/modules);
  if(!isDark(qx,qy))continue;
  const i=((y+dy)*width+x+dx)*4,alpha=Math.max(255-Math.min(base[i],base[i+1],base[i+2]),16);
  for(let c=0;c<3;c++)data[i+c]=Math.max(0,Math.min(255,Math.round((base[i+c]-(255-alpha))*255/alpha)));data[i+3]=alpha;
 }
 return {data,box:{x,y,side,modules,unit}};
}
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function crc32(a){let c=0xffffffff;for(const b of a)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function concat(...arrays){const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let p=0;for(const a of arrays){out.set(a,p);p+=a.length}return out}
function chunk(type,data){const t=new TextEncoder().encode(type),out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set(t,4);out.set(data,8);v.setUint32(data.length+8,crc32(concat(t,data)));return out}
function storedDeflate(data){let a=1,b=0;for(const n of data){a=(a+n)%65521;b=(b+a)%65521}const blocks=[new Uint8Array([0x78,0x01])];for(let p=0;p<data.length;p+=65535){const n=Math.min(65535,data.length-p),h=new Uint8Array(5);h[0]=p+n===data.length?1:0;h[1]=n&255;h[2]=n>>>8;h[3]=(~n)&255;h[4]=((~n)>>>8)&255;blocks.push(h,data.subarray(p,p+n))}const tail=new Uint8Array(4);new DataView(tail.buffer).setUint32(0,((b<<16)|a)>>>0);return concat(...blocks,tail)}
export async function encodePng(data,width,height){
 const scan=new Uint8Array(height*(width*4+1));for(let y=0;y<height;y++)scan.set(data.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
 let compressed;if(typeof CompressionStream!=='undefined'){compressed=new Uint8Array(await new Response(new Blob([scan]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer())}else compressed=storedDeflate(scan);
 const ihdr=new Uint8Array(13),v=new DataView(ihdr.buffer);v.setUint32(0,width);v.setUint32(4,height);ihdr[8]=8;ihdr[9]=6;
 return new Blob([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())],{type:'image/png'});
}
