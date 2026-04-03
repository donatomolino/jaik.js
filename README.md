# JAIK.js — JavaScript AI Kit

JAIK.js is a batteries-included micro-framework where **the only consumer is an LLM**.  
No human-readable syntax. No verbosity. Every API is 1 character.

## Why

LLMs pay per token. Every saved character = less cost, more context, faster generation.  
JAIK strips all ergonomic sugar designed for humans and replaces it with the shortest possible surface:

| Human framework | JAIK equivalent |
|---|---|
| `React.createElement('div', {style:{color:'red'}}, child)` | `h('div',{s:{color:'red'}},child)` |
| `useState([])` + `setState` + re-render | `s[0]=[];p('app')` |
| `registerComponent` / `ReactDOM.render` | `m('app',fn)` |
| `react-router` / `window.onhashchange` | `r({'/':(q)=>...})` |
| `EventEmitter` / `addEventListener` | `b('ev',handler)` |
| `fetch` + `JSON.parse` + headers | `f(url,opts)` |
| `localStorage.getItem` + `JSON.parse` | `l('key')` |
| `styled-components` / `<style>` | `x('div{color:red}','app')` |

## Browser API (`jaik.js`)

```
import{h,m,p,s,c,r,b,f,l,x}from'jaik.js';
```

| Export | Description |
|---|---|
| `s` | State array (mutable, indexed: `s[0]`, `s[1]`…) |
| `c` | Component registry (auto-filled by `m`) |
| `h(t,p,...c)` | Hyperscript: create DOM node |
| `m(id,fn)` | Mount component to body |
| `p(id)` | Patch/re-render component in-place |
| `r(routes)` | Hash-based SPA router |
| `b(ev,fn\|data)` | Event bus (pub/sub) |
| `f(url,opts)` | Fetch client with auto JSON |
| `l(key,val?)` | localStorage with auto JSON |
| `x(css,id?)` | CSS-in-JS with optional scoping |

### `h(tag, props, ...children)`

Creates a real DOM element.

| Prop pattern | Effect |
|---|---|
| `{s:{color:'red'}}` | inline style (`s` = style shorthand) |
| `{onclick:fn}` | event handler |
| `{id:'x'}` | attribute |
| `{hidden:true}` | boolean attribute |
| `{hidden:false}` | attribute omitted |

Children: strings, DOM nodes, nested arrays (auto-flattened), `null`/`false` ignored.

### `m(id, renderFn [, root])`

Registers `renderFn` in `c[id]`, calls `renderFn(s)`, sets `id`, appends to `document.body` (or optional `root`).

### `p(id)`

Finds `#id` in DOM, calls `c[id](s)`, replaces old node via `replaceWith`.

### `r(routes)`

Hash-based SPA router. Keys are hash paths, values are `fn({hash, path, query})`.  
`'*'` = fallback (404). `'/'` = root (empty hash). Returns an unlisten function.

```js
r({'/':(q)=>m('app',_=>h('div',null,'home')),'/about':(q)=>m('app',_=>h('div',null,'about')),'*':(q)=>m('app',_=>h('div',null,'404'))});
// Navigate: location.hash='#/about'
```

### `b(event, handler|data)`

Event bus.  
- `b('ev', fn)` → subscribe, returns unsubscribe function  
- `b('ev', data)` → emit (when 2nd arg is not a function)  
- `b()` → returns internal map (debug)

```js
let off=b('inc',d=>{s[0]+=d;p('app')});
b('inc',1);  // emit
off();        // unsubscribe
```

### `f(url, opts?)`

Fetch wrapper. Auto-parses JSON responses. Object bodies auto-stringified.  
`opts.q` = query params object (appended to URL).

```js
let d=await f('/api',{method:'POST',body:{n:'x'}});
let d=await f('/api',{q:{page:1,sort:'name'}});
```

### `l(key, val?)`

localStorage with auto JSON serialization.  
- `l('key')` → get (auto `JSON.parse`)  
- `l('key', val)` → set (auto `JSON.stringify`)  
- `l('key', null)` → delete

```js
l('data',[1,2,3]);
let d=l('data');     // → [1,2,3]
l('data',null);      // delete
```

### `x(css, id?)`

Inject `<style>` tag. With `id`, rules are scoped under `#id`.  
Calling with same `id` again replaces the previous styles.

```js
x('body{margin:0}');                              // global
x('div{color:red} span{font-size:12px}','app');   // scoped to #app
```

## Design Decisions for LLM Optimization

1. **1-char exports** — `h`, `m`, `p`, `s`, `c`, `r`, `b`, `f`, `l`, `x`. Named imports, no prefix object.
2. **Indexed state** — `s[0]`, `s[1]`… No string keys, no declaration, no destructuring.
3. **No JSX, no templates** — Hyperscript only. LLMs generate function calls natively.
4. **No virtual DOM** — `replaceWith` on real nodes. Zero diff overhead, zero abstraction cost.
5. **No reactivity system** — Explicit `p(id)` call. LLM decides when to re-render.
6. **`s` for style** — Saves 4 characters per styled element vs `style`.
7. **No lifecycle hooks** — Mount and patch. That's it.
8. **Flat global state** — One array, no stores, no reducers, no selectors.
9. **Batteries included** — Router, event bus, fetch, storage, CSS all built-in. Zero dependencies.

## Code Conventions (LLMs must follow)

- **Named imports only**: `import{h,m,p,s}from'jaik.js'` — no default import, no `J.` prefix
- **No whitespace**: no comments, no blank lines, no indentation
- **1-char variables**: `let a,b,d,e` (avoid `s,h,m,p,c,r,b,f,l,x` — reserved by JAIK)
- **Data as arrays**: `[['k',1],['j',2]]` not `[{name:'k',val:1}]` — access by index `x[0]`
- **Inline everything**: no named components, no helper functions unless reused 3+ times
- **Single m() call**: all DOM in one `m('app',_=>h(...))` with nested `h()`
- **Events inline**: `{onclick:()=>{s[0]++;p('app')}}`
- **`class` not `className`**

## Example (complete counter — 3 lines)

```js
import{h,m,p,s}from'jaik.js';
s[0]=0;
m('app',_=>h('div',null,h('span',null,s[0]),h('button',{onclick:()=>{s[0]++;p('app')}},'+'))); 
```

## Example (SPA with router + styles — 4 lines)

```js
import{h,m,p,s,r,x}from'jaik.js';
x('div{padding:8px} a{color:blue}','app');
let v=_=>h('div',null,h('a',{href:'#/'},'home'),' ',h('a',{href:'#/about'},'about'),h('div',null,s[0]));
r({'/':(q)=>{s[0]='Home';p('app')||m('app',v)},'/about':(q)=>{s[0]='About';p('app')||m('app',v)}});
```

## Install

```html
<script type="module">
import{h,m,p,s}from'jaik.js';
</script>
```

```
npm i jaik.js
```

ES module. No build step. No dependencies.

## Node.js API (`jaik.js/node`)

```
import{r,w,j,v,f,e,srv,cors,st}from'jaik.js/node';
```

| Export | Purpose |
|---|---|
| `r(path)` | Read file (utf8, async) |
| `w(path,data)` | Write file (auto-creates dirs, objects → JSON) |
| `j(str)` | `JSON.parse` |
| `v(obj)` | `JSON.stringify` |
| `f(url,opts)` | Fetch with auto JSON parse. Object body auto-stringified |
| `e(defaults)` | Env proxy: `e({PORT:3000}).PORT` reads `process.env.PORT` or falls back to `3000` |
| `srv(port,routes,mw?)` | HTTP server with optional middleware array |
| `cors(opts?)` | CORS middleware factory. `cors()` or `cors({origin:'http://x.com'})` |
| `st(dir,prefix?)` | Static file serving middleware. `st('./public')` or `st('./dist','/assets')` |

### Route handler

`q` = `{url, method, headers, query, res}`, `b` = parsed body.  
Return: `string` → text, `object` → JSON, `{status,headers,body}` → full control, `null` → 204.

### Middleware

Middleware functions: `async (q, b, next) => { ... return next() }`.  
Compose as array: `[cors(), st('./public'), myLogger]`.

### Node example (REST API + CORS + static — 3 lines)

```js
import{srv,cors,st}from'jaik.js/node';
let d=[{id:1,n:'a'}];
srv(3000,{'/api':(q)=>d,'POST /api':(q,b)=>{b.id=d.length+1;d.push(b);return b}},[cors(),st('./public')]);
```
