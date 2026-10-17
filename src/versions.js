/* Version history of each plan: named versions the person saves and automatic checkpoints taken while editing.
   Every version is a whole snapshot of the plan, kept in this browser under the plan's key. */
const Versions=(()=>{
  const KEY='blueprint-sketch-versions-v1',MAX_NAMED=30,MAX_AUTO=12,LABEL_MAX=60,AUTO_EVERY=10*60e3;
  const ELEMENTS=[['walls','walls'],['openings','openings'],['floors','floors'],['stairs','stairs']];
  const clone=o=>JSON.parse(JSON.stringify(o));
  const uid=()=>'v'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const cleanLabel=text=>String(text||'').trim().replace(/\s+/g,' ').slice(0,LABEL_MAX);

  // synchronous SHA-256 of a string (UTF-8), as hex
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  function sha256(text){
    const bytes=new TextEncoder().encode(text),len=bytes.length,total=((len+9+63)>>6)<<6,buf=new Uint8Array(total);
    buf.set(bytes);buf[len]=0x80;
    const view=new DataView(buf.buffer);
    view.setUint32(total-8,Math.floor(len*8/2**32));view.setUint32(total-4,(len*8)>>>0);
    const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Array(64);
    const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
    for(let off=0;off<total;off+=64){
      for(let i=0;i<16;i++)w[i]=view.getUint32(off+i*4);
      for(let i=16;i<64;i++){
        const a=rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3),b=rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);
        w[i]=(w[i-16]+a+w[i-7]+b)>>>0;
      }
      let[a,b,c,d,e,f,g,hh]=h;
      for(let i=0;i<64;i++){
        const t1=(hh+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0,t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
        hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
      }
      [a,b,c,d,e,f,g,hh].forEach((v,i)=>{h[i]=(h[i]+v)>>>0;});
    }
    return h.map(v=>v.toString(16).padStart(8,'0')).join('');
  }

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
      list:key=>newestFirst([...(data[key]||[])]).map(v=>v.hash?v:{...v,hash:sha256(JSON.stringify(v.state))}),
      get:(key,id)=>(data[key]||[]).find(v=>v.id===id)||null,
      // returns the saved version, null when an automatic one would repeat the newest, or {error}
      add(key,{state,label,kind='named',thumb=null,at=Date.now()}){
        const list=all(key),json=JSON.stringify(state);
        const newest=newestFirst([...list])[0];
        if(newest&&kind==='auto'&&(newest.hash||sha256(JSON.stringify(newest.state)))===sha256(json))return null;
        if(kind==='named'&&list.filter(v=>v.kind==='named').length>=MAX_NAMED)return{error:'full'};
        const version={id:uid(),at,kind,hash:sha256(json),label:cleanLabel(label)||(kind==='auto'?'Punto automático':'Versión'),thumb,state:JSON.parse(json)};
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

  return{create,diff,sha256,KEY,MAX_NAMED,MAX_AUTO,AUTO_EVERY,LABEL_MAX};
})();
if(typeof module!=='undefined')module.exports=Versions;
