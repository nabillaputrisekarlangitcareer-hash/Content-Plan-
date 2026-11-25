/* Lapisan penyimpanan offline-first: menyediakan claude.use("db"/"user"/"downloads")
   untuk halaman ini. Data disimpan di perangkat dan disinkronkan ke /api/sync. */
(function(){
"use strict";
var KEY="cp_state_v1",PASS="cp_pass_v1",st=null,pass="";
try{st=JSON.parse(localStorage.getItem(KEY)||"null");}catch(e){}
if(!st||!st.r)st={r:{},dirty:{},since:0};
try{pass=localStorage.getItem(PASS)||"";}catch(e){}
var ls=[],waiters=[],timer=null,busy=false,lastErr="",badgeEl=null,askEl=null;
function save(){try{localStorage.setItem(KEY,JSON.stringify(st));}catch(e){}}
function idOf(p){return p.split("/").pop();}
function clone(o){return JSON.parse(JSON.stringify(o));}
function snapDoc(k){var r=st.r[k],ok=!!(r&&!r.x);return {id:idOf(k),exists:ok,data:function(){return ok?clone(r.d):undefined;}};}
function snapCol(n){var docs=[];Object.keys(st.r).forEach(function(k){if(k.indexOf(n+"/")===0&&!st.r[k].x)docs.push(snapDoc(k));});return {size:docs.length,docs:docs};}
function fire(l){try{l.cb(l.doc?snapDoc(l.doc):snapCol(l.col));}catch(e){console.error(e);}}
function notify(){ls.slice().forEach(fire);badge();}
function listen(l,cb){l.cb=cb;ls.push(l);setTimeout(function(){fire(l);},0);return function(){var i=ls.indexOf(l);if(i>-1)ls.splice(i,1);};}
function write(path,data,merge){
  if(!pass)return Promise.reject(new Error("not_granted"));
  var cur=st.r[path],base=merge&&cur&&!cur.x?cur.d:{};
  st.r[path]={d:Object.assign({},base,clone(data)),u:Date.now(),x:0};st.dirty[path]=1;save();notify();sched(800);return Promise.resolve();
}
function del(path){
  if(!pass)return Promise.reject(new Error("not_granted"));
  st.r[path]={d:{},u:Date.now(),x:1};st.dirty[path]=1;save();notify();sched(800);return Promise.resolve();
}
function docRef(path){return {id:idOf(path),path:path,
  set:function(d){return write(path,d,false);},update:function(d){return write(path,d,true);},
  delete:function(){return del(path);},get:function(){return Promise.resolve(snapDoc(path));},
  onSnapshot:function(cb){return listen({doc:path},cb);}};}
function colRef(n){return {
  add:function(d){var p=n+"/n"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);return write(p,d,false).then(function(){return docRef(p);});},
  doc:function(id){return docRef(n+"/"+(id||"n"+Date.now().toString(36)));},
  onSnapshot:function(cb){return listen({col:n},cb);}};}
var db={collection:colRef,doc:docRef};
var user={canEdit:function(){return pass?Promise.resolve(true):new Promise(function(res){waiters.push(function(){res(true);});});},
  isOwner:function(){return Promise.resolve(!!pass);},can:function(){return Promise.resolve(!!pass);}};
var downloads={save:function(o){return new Promise(function(res){
  var b=new Blob([o.data],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");
  a.href=URL.createObjectURL(b);a.download=o.filename||"data.csv";document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();res();},500);});}};
var mods={db:db,user:user,downloads:downloads};
window.claude={use:function(n){return Promise.resolve(mods[n]||null);}};

function sched(ms){clearTimeout(timer);timer=setTimeout(sync,ms);}
function pending(){return Object.keys(st.dirty).length;}
function sync(){
  if(busy||!pass||!navigator.onLine){badge();return;}
  busy=true;var sent={};Object.keys(st.dirty).forEach(function(k){sent[k]=st.r[k];});
  badge();
  fetch("/api/sync",{method:"POST",headers:{"content-type":"application/json","x-passcode":pass},body:JSON.stringify({changes:sent,since:st.since||0})})
  .then(function(r){
    if(r.status===401){pass="";try{localStorage.removeItem(PASS);}catch(e){}ask("Passcode salah atau sudah diganti. Masukkan lagi.");throw new Error("passcode");}
    if(!r.ok)throw new Error("HTTP "+r.status);return r.json();})
  .then(function(j){
    Object.keys(sent).forEach(function(k){if(st.r[k]&&st.r[k].u===sent[k].u)delete st.dirty[k];});
    Object.keys(j.records||{}).forEach(function(k){var s=j.records[k],l=st.r[k];
      if(!l||s.u>l.u||(s.u===l.u&&!st.dirty[k]))st.r[k]={d:s.d,u:s.u,x:s.x?1:0};});
    st.since=j.seq||st.since;lastErr="";save();notify();})
  .catch(function(e){lastErr=String(e&&e.message||e);})
  .then(function(){busy=false;badge();sched(20000);});
}
function badge(){
  if(!document.body)return;
  if(!badgeEl){badgeEl=document.createElement("div");
    badgeEl.style.cssText="position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:50;padding:5px 12px;border-radius:999px;font:600 12px system-ui,sans-serif;background:var(--surface,#fff);color:var(--muted,#555);border:1px solid var(--line,#ddd);box-shadow:0 2px 8px rgba(0,0,0,.15);cursor:pointer";
    badgeEl.title="Klik untuk sinkronkan sekarang";badgeEl.addEventListener("click",function(){sync();});document.body.appendChild(badgeEl);}
  var n=pending(),t;
  if(!pass)t="Belum masuk";
  else if(!navigator.onLine)t="Offline"+(n?" · "+n+" perubahan menunggu":"");
  else if(busy)t="Menyinkronkan…";
  else if(lastErr)t="Gagal sinkron"+(n?" · "+n+" menunggu":"");
  else t=n?n+" perubahan menunggu":"Tersinkron";
  badgeEl.textContent=t;
}
function ask(msg){
  if(askEl||!document.body){if(!document.body)document.addEventListener("DOMContentLoaded",function(){ask(msg);});return;}
  askEl=document.createElement("div");
  askEl.style.cssText="position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px";
  var c=document.createElement("div");c.style.cssText="background:var(--surface,#fff);color:var(--text,#111);border-radius:16px;padding:20px;width:min(360px,100%);font:15px system-ui,sans-serif";
  var h=document.createElement("div");h.textContent="Masuk ke Content Plan";h.style.cssText="font-weight:700;font-size:17px;margin-bottom:6px";
  var p=document.createElement("div");p.textContent=msg||"Masukkan passcode tim. Cukup sekali di tiap perangkat.";p.style.cssText="color:var(--muted,#666);font-size:13px;margin-bottom:12px";
  var i=document.createElement("input");i.type="password";i.placeholder="Passcode";i.autocomplete="current-password";
  i.style.cssText="width:100%;padding:10px;border:1px solid var(--line,#ccc);border-radius:10px;font:inherit;background:var(--bg,#fff);color:inherit;margin-bottom:10px";
  var b=document.createElement("button");b.textContent="Masuk";b.style.cssText="width:100%;padding:10px;border:0;border-radius:10px;background:var(--accent,#4f46e5);color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer";
  function go(){var v=i.value.trim();if(!v)return;pass=v;try{localStorage.setItem(PASS,v);}catch(e){}
    askEl.remove();askEl=null;var w=waiters.splice(0);w.forEach(function(f){f();});notify();sync();}
  b.addEventListener("click",go);i.addEventListener("keydown",function(e){if(e.key==="Enter")go();});
  c.appendChild(h);c.appendChild(p);c.appendChild(i);c.appendChild(b);askEl.appendChild(c);document.body.appendChild(askEl);i.focus();
}
window.addEventListener("online",function(){sync();});
window.addEventListener("offline",badge);
document.addEventListener("visibilitychange",function(){if(!document.hidden)sync();});
function start(){badge();if(!pass)ask("");else sched(300);}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();
})();
