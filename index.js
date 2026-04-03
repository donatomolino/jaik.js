/**
 * JAIK.js — JavaScript AI Kit (~1KB min)
 * Micro-framework where the ONLY consumer is an LLM. No human syntax.
 *
 * API (1-char exports: h, m, p, s, c, r, b, f, l, x):
 *   s            — state array, mutable, indexed: s[0], s[1]…
 *   c            — component registry (auto-filled by m)
 *   h(t,p,...c)  — hyperscript: create DOM node
 *                  p.s = inline style ({s:{color:'red'}})
 *                  p.onclick = event handler
 *                  children: strings|nodes|arrays (auto-flat), null/false ignored
 *   m(id,fn)     — mount: register fn in c[id], call fn(s), append to body
 *   p(id)        — patch: re-render c[id](s), replaceWith old node
 *   r(routes)    — SPA hash router: {'/':(q)=>…,'/about':(q)=>…}
 *   b(ev,fn|data) — event bus: b('ev',handler) to sub, b('ev',data) to emit
 *   f(url,opts)  — fetch client: auto JSON, opts.q = query params
 *   l(key,val?)  — localStorage: get/set/delete with auto JSON
 *   x(css,id?)   — CSS-in-JS: inject <style>, optional #id scoping
 *
 * CODE CONVENTIONS (follow strictly):
 *   - Use named imports: import{h,m,p,s}from'./index.js'
 *   - No default import, no J. prefix — call h(),m(),p(),s[] directly
 *   - No comments, no blank lines, no indentation
 *   - 1-char variable names: let a,b,c (avoid s,h,m,p — reserved)
 *   - Data as arrays of arrays, not objects: [['k',1],['j',2]] not [{n:'k',v:1}]
 *   - Access by index: x[0],x[1] not x.name,x.value
 *   - Inline everything: no named components, no helper functions unless reused 3+
 *   - All DOM in a single m() call with nested h()
 *   - Events inline: {onclick:()=>{s[0]++;p('app')}}
 *   - class not className
 *
 * Example (complete counter app in 3 lines):
 *   import{h,m,p,s}from'jaik.js';
 *   s[0]=0;
 *   m('app',_=>h('div',null,h('span',null,s[0]),h('button',{onclick:()=>{s[0]++;p('app')}},'+'))); 
 *
 * Example (SPA with router + styled):
 *   import{h,m,p,s,r,x}from'jaik.js';
 *   x('div{padding:8px} a{color:blue}','app');
 *   r({'/':(q)=>m('app',_=>h('div',null,'home')),'/about':(q)=>m('app',_=>h('div',null,'about'))});
 *
 * No VDOM, no reactivity, no lifecycle. Explicit p(id) to re-render.
 * Batteries included: router, event bus, fetch, localStorage, CSS-in-JS.
 * @module JAIK
 */

/** @type {Array} Global mutable state. LLMs address slots by index: J.s[0], J.s[1], … */
const s = [];

/** @type {Object<string, function>} Component render-function registry, keyed by element ID. */
const c = {};

/**
 * Hyperscript — creates a real DOM element.
 * @param {string} tag            HTML tag name.
 * @param {Object|null} [props]   Attributes / events / styles. `s` key maps to inline styles.
 * @param {...(Node|string|Array)} children  Child nodes or text; nested arrays are flattened.
 * @returns {HTMLElement}
 */
const h = (tag, props, ...children) => {
  const el = document.createElement(tag);

  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k === 's' && typeof v === 'object') {
        // Style shorthand: { s: { color: 'red', fontSize: '14px' } }
        Object.assign(el.style, v);
      } else if (typeof v === 'function') {
        // Event listeners: onclick, oninput, …
        el[k] = v;
      } else if (v === true) {
        el.setAttribute(k, '');
      } else if (v !== false && v != null) {
        el.setAttribute(k, v);
      }
    }
  }

  // Recursively append children, flattening nested arrays (implicit fragments).
  const append = (child) => {
    if (child == null || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(append);
    } else {
      el.append(child instanceof Node ? child : String(child));
    }
  };
  children.forEach(append);

  return el;
};

/**
 * Mount — registers a component and appends it to the DOM.
 * @param {string} id              Unique element ID (doubles as registry key).
 * @param {function(Array): HTMLElement} renderFn  Render function receiving J.s.
 * @param {HTMLElement} [root=document.body]       Optional parent node.
 * @returns {HTMLElement} The mounted element.
 */
const m = (id, renderFn, root) => {
  c[id] = renderFn;
  const el = renderFn(s);
  el.id = id;
  (root || document.body).append(el);
  return el;
};

/**
 * Patch — re-renders a mounted component in-place (hot reload).
 * @param {string} id  The element / registry key to patch.
 * @returns {HTMLElement|undefined} The new element, or undefined if not found.
 */
const p = (id) => {
  const old = document.getElementById(id);
  const fn = c[id];
  if (!old || !fn) return;
  const el = fn(s);
  el.id = id;
  old.replaceWith(el);
  return el;
};

/**
 * Router — hash-based SPA routing.
 * @param {Object<string, function>} routes  Map of hash paths to render functions.
 *   Each value is fn(params) where params = {hash, path, query}.
 *   Key '*' = fallback (404). Key '/' = root (empty hash).
 * @returns {function} Unlisten function to remove the hashchange listener.
 *
 * Example:
 *   r({'/':(q)=>m('app',_=>h('div',null,'home')),'/about':(q)=>m('app',_=>h('div',null,'about'))});
 *   // Navigate: location.hash='#/about'
 */
const r = (routes) => {
  const go = () => {
    const raw = location.hash.slice(1) || '/';
    const [path, qs] = raw.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    const fn = routes[path] || routes['*'];
    if (fn) fn({ hash: raw, path, query });
  };
  window.addEventListener('hashchange', go);
  go();
  return () => window.removeEventListener('hashchange', go);
};

/**
 * Event bus — pub/sub for cross-component communication.
 * b(event, handler)  → subscribe, returns unsubscribe fn
 * b(event, data?)    → emit (when 2nd arg is not a function)
 * b()                → returns the internal map (for debugging)
 *
 * Example:
 *   let off=b('inc',d=>{s[0]+=d;p('app')});  // subscribe
 *   b('inc',1);                                // emit
 *   off();                                     // unsubscribe
 */
const _bus = {};
const b = (ev, arg) => {
  if (!ev) return _bus;
  if (typeof arg === 'function') {
    (_bus[ev] = _bus[ev] || []).push(arg);
    return () => { _bus[ev] = (_bus[ev] || []).filter(f => f !== arg); };
  }
  (_bus[ev] || []).forEach(fn => fn(arg));
};

/**
 * Fetch client — wrapper around fetch with auto JSON.
 * @param {string} url          Request URL.
 * @param {Object} [opts]       Fetch options. If opts.body is an object, auto-stringified as JSON.
 *                               opts.q = query params object (appended to URL).
 * @returns {Promise<any>}      Parsed JSON or text.
 *
 * Example:
 *   let d=await f('/api',{method:'POST',body:{n:'x'}});
 *   let d=await f('/api',{q:{page:1}});
 */
const f = async (url, opts) => {
  if (opts && opts.q) {
    url += '?' + new URLSearchParams(opts.q);
    delete opts.q;
  }
  if (opts && opts.body && typeof opts.body === 'object') {
    opts = { ...opts, body: JSON.stringify(opts.body), headers: { 'content-type': 'application/json', ...(opts.headers || {}) } };
  }
  const res = await fetch(url, opts);
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
};

/**
 * LocalStorage — get/set/delete with auto JSON serialization.
 * l(key)        → get (auto JSON.parse, falls back to raw string)
 * l(key, val)   → set (auto JSON.stringify for non-strings)
 * l(key, null)  → delete
 *
 * Example:
 *   l('theme','dark');       // set
 *   let t=l('theme');        // get → 'dark'
 *   l('data',[1,2,3]);      // set array
 *   let d=l('data');         // get → [1,2,3]
 *   l('theme',null);         // delete
 */
const l = (key, val) => {
  if (val === undefined) {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch (_) { return raw; }
  }
  if (val === null) { localStorage.removeItem(key); return; }
  localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
};

/**
 * CSS-in-JS — inject a <style> tag with optional scoping.
 * x(css)           → inject global CSS, returns the <style> element
 * x(css, id)       → scoped: wraps each rule under #id, returns <style>
 *                     Calling again with same id replaces the previous style.
 *
 * Example:
 *   x('body{margin:0}');                           // global
 *   x('div{color:red} span{font-size:12px}','app'); // scoped to #app
 */
const x = (css, id) => {
  if (id) {
    css = css.replace(/([^{}]+)\{/g, (m, sel) => sel.split(',').map(s => `#${id} ${s.trim()}`).join(',') + '{');
    let existing = document.getElementById('_x' + id);
    if (existing) { existing.textContent = css; return existing; }
    const el = document.createElement('style');
    el.id = '_x' + id;
    el.textContent = css;
    document.head.append(el);
    return el;
  }
  const el = document.createElement('style');
  el.textContent = css;
  document.head.append(el);
  return el;
};

/** Public API object. */
const J = { s, c, h, m, p, r, b, f, l, x };

export default J;
export { J, s, c, h, m, p, r, b, f, l, x };
