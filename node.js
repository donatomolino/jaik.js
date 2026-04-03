/**
 * JAIK.js/node — Node.js utilities for AI (~1KB min)
 * Same philosophy: 1-char exports, zero verbosity, minimal tokens.
 *
 * API:
 *   r(path)         — read file (utf8 string)
 *   w(path,data)    — write file (creates dirs)
 *   j(str)          — JSON.parse
 *   v(obj)          — JSON.stringify
 *   f(url,opts)     — fetch, auto-parses JSON response
 *   e(obj)          — env: obj keys become defaults, returns process.env proxy
 *   srv(port,rt,mw) — start HTTP server with optional middleware array
 *                     rt = {'/path':(q,b)=>response}
 *                     mw = [cors(), st('./public'), customFn]
 *                     q = {url,method,headers,query,res}, b = parsed body
 *                     return: string|object(→JSON)|{status,headers,body}
 *   cors(opts?)     — CORS middleware factory. opts={origin,methods,headers}
 *   st(dir,prefix?) — static file serving middleware. Serves dir, optional URL prefix
 *
 * CODE CONVENTIONS (same as browser):
 *   import{r,w,j,v,f,srv,cors,st}from'jaik.js/node';
 *   No whitespace, no comments, 1-char vars, inline everything.
 *
 * Example (API server with CORS + static in 3 lines):
 *   import{srv,cors,st}from'jaik.js/node';
 *   let d=[{id:1,name:'a'}];
 *   srv(3000,{'/api':(q)=>d,'POST /api':(q,b)=>{b.id=d.length+1;d.push(b);return b}},[cors(),st('./public')]);
 *
 * @module JAIK/node
 */
import{createServer}from'node:http';
import{readFile,writeFile,mkdir,stat}from'node:fs/promises';
import{dirname,join,extname}from'node:path';
import{parse}from'node:url';

/** Read file as utf8 string */
const r=async(p)=>readFile(p,'utf8');

/** Write file, auto-create parent dirs */
const w=async(p,d)=>{await mkdir(dirname(p),{recursive:true}).catch(()=>{});return writeFile(p,typeof d==='string'?d:JSON.stringify(d))};

/** JSON.parse */
const j=(s)=>JSON.parse(s);

/** JSON.stringify */
const v=(o)=>JSON.stringify(o);

/** Fetch with auto JSON parse */
const f=async(u,o)=>{const r=await fetch(u,o&&o.body&&typeof o.body==='object'?{...o,body:JSON.stringify(o.body),headers:{'content-type':'application/json',...(o.headers||{})}}:o);const t=r.headers.get('content-type')||'';return t.includes('json')?r.json():r.text()};

/** Env defaults — returns process.env with fallback values */
const e=(d)=>new Proxy(process.env,{get:(t,k)=>t[k]??d[k]});

/** Minimal HTTP server with middleware support
 *  srv(port, rt)          — routes only
 *  srv(port, rt, mw)      — routes + middleware array
 *  Middleware: async (q,b,next)=>{ ... return next() }
 *  q = {url,method,headers,query,params}, b = parsed body
 */
const srv=(port,rt,mw)=>{
const body=r=>new Promise((y,n)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{y(d?JSON.parse(d):null)}catch(_){y(d)}})});
const run=async(fns,q,b,i=0)=>{if(i>=fns.length)return;return fns[i](q,b,()=>run(fns,q,b,i+1))};
createServer(async(q,z)=>{
const u=parse(q.url,true);const k=q.method+' '+u.pathname;const fn=rt[k]||rt[u.pathname];
const reqObj={url:u.pathname,method:q.method,headers:q.headers,query:u.query,res:z};
const b=await body(q);
if(mw&&mw.length){const r=await run(mw,reqObj,b);if(z.writableEnded)return;if(r!==undefined){if(typeof r==='object'&&r.status){z.writeHead(r.status,r.headers||{});z.end(typeof r.body==='object'?JSON.stringify(r.body):r.body||'');return}if(typeof r==='object'){z.writeHead(200,{'content-type':'application/json'});z.end(JSON.stringify(r))}else if(r!==undefined){z.writeHead(200,{'content-type':'text/plain'});z.end(String(r))}return}}
if(!fn){z.writeHead(404);z.end('');return}
try{const res=await fn(reqObj,b);
if(res===null||res===undefined){z.writeHead(204);z.end();return}
if(typeof res==='object'&&res.status){z.writeHead(res.status,res.headers||{});z.end(typeof res.body==='object'?JSON.stringify(res.body):res.body||'');return}
if(typeof res==='object'){z.writeHead(200,{'content-type':'application/json'});z.end(JSON.stringify(res))}
else{z.writeHead(200,{'content-type':'text/plain'});z.end(String(res))}}
catch(err){z.writeHead(500);z.end(v({error:String(err)}))}
}).listen(port)};

/** CORS middleware factory
 *  cors()                — allow all origins
 *  cors({origin:'http://x.com', methods:'GET,POST'})
 *
 *  Example: srv(3000,routes,[cors()])
 */
const cors=(opts)=>{
const o=opts||{};const origin=o.origin||'*';const methods=o.methods||'GET,POST,PUT,DELETE,PATCH,OPTIONS';const headers=o.headers||'content-type,authorization';
return async(q,b,next)=>{
q.res.setHeader('access-control-allow-origin',origin);
q.res.setHeader('access-control-allow-methods',methods);
q.res.setHeader('access-control-allow-headers',headers);
if(q.method==='OPTIONS'){q.res.writeHead(204);q.res.end();return}
return next()}};

/** MIME types for static file serving */
const _mime={'html':'text/html','css':'text/css','js':'application/javascript','json':'application/json','png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','gif':'image/gif','svg':'image/svg+xml','ico':'image/x-icon','woff':'font/woff','woff2':'font/woff2','txt':'text/plain','pdf':'application/pdf','webp':'image/webp','mp4':'video/mp4'};

/** Static file serving middleware factory
 *  st(dir)                — serve files from dir
 *  st(dir, prefix)        — serve under URL prefix (e.g. '/static')
 *
 *  Example: srv(3000,routes,[st('./public')])
 *  Example: srv(3000,routes,[cors(),st('./dist','/assets')])
 */
const st=(dir,prefix)=>{
const pfx=prefix||'';
return async(q,b,next)=>{
if(q.method!=='GET'&&q.method!=='HEAD')return next();
let fp=q.url;
if(pfx&&!fp.startsWith(pfx))return next();
if(pfx)fp=fp.slice(pfx.length)||'/';
if(fp.includes('..')){q.res.writeHead(403);q.res.end();return}
if(fp==='/'||fp==='')fp='/index.html';
const full=join(dir,fp);
try{const s=await stat(full);if(!s.isFile())return next();
const ext=extname(full).slice(1);const ct=_mime[ext]||'application/octet-stream';
const data=await readFile(full);
q.res.writeHead(200,{'content-type':ct,'content-length':data.length});
q.res.end(data)}catch(_){return next()}}};

export{r,w,j,v,f,e,srv,cors,st};
