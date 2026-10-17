// Server-side whitelist of what a plan may contain. Anything else is dropped,
// and malformed input is rejected, so shared plans can't carry arbitrary data.
const ID=/^[A-Za-z0-9_-]{1,40}$/;
const KEY=/^[a-z0-9_]{1,40}$/;
const COLOR=/^#[0-9a-fA-F]{6}$/;
const FINISHES=new Set(['pintura','micro','ladrillo','enchape','madera']);
const MAX={items:500,walls:400,openings:400,floors:100,lights:100,faces:2000,prices:300};
const PRICE_KEY=/^[A-Za-z0-9:_.-]{1,60}$/;
const MAX_PRICE=1e9;
const LIMIT=1000;

class Invalid extends Error{}
const fail=what=>{throw new Invalid(what);};
const num=(v,what,min=-LIMIT,max=LIMIT)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(what);return v;};
const id=(v,what)=>{if(typeof v!=='string'||!ID.test(v))fail(what);return v;};
const key=(v,what)=>{if(typeof v!=='string'||!KEY.test(v))fail(what);return v;};
const text=(v,what,max)=>{if(typeof v!=='string'||v.length>max)fail(what);return v;};
const list=(v,what,max)=>{if(!Array.isArray(v)||v.length>max)fail(what);return v;};
const obj=(v,what)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(what);return v;};

function finish(v,what){
  obj(v,what);
  const out={t:v.t};
  if(!FINISHES.has(v.t))fail(what);
  if(v.p!==undefined)out.p=key(v.p,what);
  if(v.c!==undefined){if(typeof v.c!=='string'||!COLOR.test(v.c))fail(what);out.c=v.c;}
  return out;
}
function item(i){
  obj(i,'item');
  const out={id:id(i.id,'item id'),t:key(i.t,'item type'),x:num(i.x,'item x'),z:num(i.z,'item z'),r:num(i.r,'item r',0,3)};
  if(!Number.isInteger(out.r))fail('item r');
  for(const k of['y','a','sx','sz'])if(i[k]!==undefined)out[k]=num(i[k],'item '+k,-360,LIMIT);
  return out;
}
function wall(w){
  obj(w,'wall');
  const out={id:id(w.id,'wall id'),x1:num(w.x1,'wall'),z1:num(w.z1,'wall'),x2:num(w.x2,'wall'),z2:num(w.z2,'wall'),t:num(w.t,'wall thickness',.02,1)};
  out.faces={};
  for(const side of['lo','hi'])if(w.faces&&w.faces[side]!==undefined)out.faces[side]=id(w.faces[side],'face id');
  return out;
}
function opening(o){
  obj(o,'opening');
  if(o.kind!=='door'&&o.kind!=='window')fail('opening kind');
  return{id:id(o.id,'opening id'),wall:id(o.wall,'opening wall'),pos:num(o.pos,'opening',0,LIMIT),w:num(o.w,'opening',.1,LIMIT),
    h:num(o.h,'opening',.1,10),sill:num(o.sill,'opening',0,10),kind:o.kind};
}
function floor(f){
  obj(f,'floor');
  return{id:id(f.id,'floor id'),x:num(f.x,'floor'),z:num(f.z,'floor'),w:num(f.w,'floor',.1,LIMIT),d:num(f.d,'floor',.1,LIMIT),
    f:key(f.f,'floor finish'),name:text(f.name||'','floor name',30),zone:text(f.zone||'','floor zone',20)};
}
function light(l){
  obj(l,'light');
  return{x:num(l.x,'light'),z:num(l.z,'light'),drop:num(l.drop,'light',0,5)};
}

function prices(p){
  if(p===undefined)return{};
  obj(p,'prices');
  const keys=Object.keys(p);
  if(keys.length>MAX.prices)fail('too many prices');
  const out={};
  for(const k of keys){if(!PRICE_KEY.test(k))fail('price key');out[k]=num(p[k],'price',0,MAX_PRICE);}
  return out;
}

export function cleanState(s){
  obj(s,'state');
  const L=obj(s.layout,'layout'),walls={};
  const faces=obj(s.walls,'walls');
  const faceKeys=Object.keys(faces);
  if(faceKeys.length>MAX.faces)fail('too many faces');
  for(const k of faceKeys)walls[id(k,'face key')]=finish(faces[k],'face finish');
  return{
    style:typeof s.style==='string'&&KEY.test(s.style)?s.style:'',
    metal:key(s.metal,'metal'),wood:key(s.wood,'wood'),
    walls,wallBase:finish(s.wallBase,'wall base'),
    prices:prices(s.prices),currency:s.currency===undefined?'$':text(s.currency,'currency',4),
    defaults:{floor:key(obj(s.defaults,'defaults').floor,'default floor')},
    n:num(s.n,'counter',0,1e7),
    items:list(s.items,'items',MAX.items).map(item),
    layout:{
      walls:list(L.walls,'walls',MAX.walls).map(wall),
      openings:list(L.openings,'openings',MAX.openings).map(opening),
      floors:list(L.floors,'floors',MAX.floors).map(floor),
      lights:list(L.lights||[],'lights',MAX.lights).map(light),
      tag:L.tag==='house'?'house':''
    }
  };
}
export const cleanName=n=>{if(typeof n!=='string')fail('name');const t=n.trim().slice(0,60);if(!t)fail('name');return t;};
export const isInvalid=e=>e instanceof Invalid;
