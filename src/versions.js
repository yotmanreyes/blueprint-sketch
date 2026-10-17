/* Version history of each plan: named versions the person saves and automatic checkpoints taken while editing.
   Every version is a whole snapshot of the plan, kept in this browser under the plan's key. */
const Versions=(()=>{
  const KEY='blueprint-sketch-versions-v1',MAX_NAMED=30,MAX_AUTO=12,LABEL_MAX=60,AUTO_EVERY=10*60e3;
  const ELEMENTS=[['walls','walls'],['openings','openings'],['floors','floors'],['stairs','stairs']];
  const clone=o=>JSON.parse(JSON.stringify(o));
  const uid=()=>'v'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const cleanLabel=text=>String(text||'').trim().replace(/\s+/g,' ').slice(0,LABEL_MAX);

  function create(storage){
    let data=read();

    function read(){
      try{const d=JSON.parse(storage.getItem(KEY));if(d&&typeof d==='object'&&!Array.isArray(d))return d;}catch(e){}
      return{};
    }
    function persist(){
      try{storage.setItem(KEY,JSON.stringify(data));return true;}catch(e){return false;}
    }
    const all=key=>data[key]||(data[key]=[]);
    const newestFirst=list=>list.sort((a,b)=>b.at-a.at);

    function trim(list){
      for(const kind of['auto','named']){
        const limit=kind==='auto'?MAX_AUTO:MAX_NAMED;
        const mine=newestFirst(list.filter(v=>v.kind===kind));
        for(const extra of mine.slice(limit))list.splice(list.indexOf(extra),1);
      }
    }
    // a full store gives up its oldest automatic checkpoints before refusing a version
    function persistOrShrink(){
      while(!persist()){
        const oldest=Object.values(data).flat().filter(v=>v.kind==='auto').sort((a,b)=>a.at-b.at)[0];
        if(!oldest)return false;
        const owner=Object.keys(data).find(k=>data[k].includes(oldest));
        data[owner].splice(data[owner].indexOf(oldest),1);
      }
      return true;
    }

    return{
      list:key=>newestFirst([...(data[key]||[])]),
      get:(key,id)=>(data[key]||[]).find(v=>v.id===id)||null,
      // returns the saved version, null when an automatic one would repeat the newest, or {error}
      add(key,{state,label,kind='named',thumb=null,at=Date.now()}){
        const list=all(key),json=JSON.stringify(state);
        const newest=newestFirst([...list])[0];
        if(newest&&JSON.stringify(newest.state)===json&&kind==='auto')return null;
        if(kind==='named'&&list.filter(v=>v.kind==='named').length>=MAX_NAMED)return{error:'full'};
        const version={id:uid(),at,kind,label:cleanLabel(label)||(kind==='auto'?'Punto automático':'Versión'),thumb,state:JSON.parse(json)};
        list.push(version);
        trim(list);
        if(!persistOrShrink()){list.splice(list.indexOf(version),1);return{error:'storage'};}
        return version;
      },
      lastAutoAt:key=>Math.max(0,...(data[key]||[]).filter(v=>v.kind==='auto').map(v=>v.at)),
      rename(key,id,label){
        const v=this.get(key,id),clean=cleanLabel(label);
        if(!v||!clean)return false;
        v.label=clean;return persist();
      },
      // keeping an automatic checkpoint turns it into a named one
      keep(key,id){const v=this.get(key,id);if(!v)return false;v.kind='named';return persist();},
      remove(key,id){const list=data[key]||[],i=list.findIndex(v=>v.id===id);if(i<0)return false;list.splice(i,1);return persist();},
      drop(key){if(!(key in data))return;delete data[key];persist();},
      bytes:key=>JSON.stringify(data[key]||[]).length,
      // versions that travel inside an exported plan file; unknown shapes are ignored
      exportFor:key=>newestFirst((data[key]||[]).map(v=>({at:v.at,kind:v.kind,label:v.label,state:v.state}))),
      importInto(key,incoming,isValid){
        if(!Array.isArray(incoming))return 0;
        let n=0;
        for(const v of incoming.slice(0,MAX_NAMED+MAX_AUTO)){
          if(!v||typeof v!=='object'||!isValid(v.state))continue;
          const added=this.add(key,{state:v.state,label:v.label,kind:v.kind==='auto'?'auto':'named',at:Number.isFinite(v.at)?v.at:Date.now()});
          if(added&&!added.error)n++;
        }
        return n;
      }
    };
  }

  /* What changed from one plan to another, counted by kind of element and matched by id, level by level. */
  function diff(from,to){
    const kinds={walls:0,openings:0,floors:0,stairs:0,items:0};
    const out={added:{...kinds},removed:{...kinds},changed:{...kinds},levelsAdded:0,levelsRemoved:0,settings:false};
    const index=state=>{
      const map=new Map();
      for(const level of Levels.list(state)){
        for(const[kind,field]of ELEMENTS)for(const el of level.layout[field]||[])map.set(`${level.id}/${kind}/${el.id}`,JSON.stringify(el));
        for(const it of level.items)map.set(`${level.id}/items/${it.id}`,JSON.stringify(it));
      }
      return map;
    };
    const a=index(from),b=index(to);
    for(const[key,json]of b){
      const kind=key.split('/')[1];
      if(!a.has(key))out.added[kind]++;
      else if(a.get(key)!==json)out.changed[kind]++;
    }
    for(const key of a.keys())if(!b.has(key))out.removed[key.split('/')[1]]++;
    const ids=state=>new Set(Levels.list(state).map(l=>l.id));
    const before=ids(from),after=ids(to);
    out.levelsAdded=[...after].filter(id=>!before.has(id)).length;
    out.levelsRemoved=[...before].filter(id=>!after.has(id)).length;
    const names=state=>JSON.stringify(Levels.list(state).map(l=>[l.id,l.name,l.layout.layers]));
    const rest=state=>{const{layout,items,levels,level,...others}=state;return JSON.stringify([others,names(state)]);};
    out.settings=rest(from)!==rest(to);
    out.total=Object.values(out.added).concat(Object.values(out.removed),Object.values(out.changed)).reduce((s,n)=>s+n,0)+out.levelsAdded+out.levelsRemoved;
    out.same=out.total===0&&!out.settings;
    return out;
  }

  return{create,diff,KEY,MAX_NAMED,MAX_AUTO,AUTO_EVERY,LABEL_MAX};
})();
if(typeof module!=='undefined')module.exports=Versions;
