const PlanStore=(()=>{
  const KEY='blueprint-sketch-plans-v1',PREVIOUS_KEY='plano-cuarto-bano-v2',LEGACY_KEY='plano-cuarto-bano-v1',EXPORT_APP='blueprint-sketch';
  const isValid=s=>!!s&&Array.isArray(s.items)&&!!s.walls&&typeof s.walls==='object';
  const uid=()=>'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const clone=o=>JSON.parse(JSON.stringify(o));

  function create(makeDefault){
    let data=read();

    function read(){
      for(const key of[KEY,PREVIOUS_KEY]){
        try{const d=JSON.parse(localStorage.getItem(key));if(d&&d.plans&&d.plans[d.active])return d;}catch(e){}
      }
      let legacy=null;
      try{legacy=JSON.parse(localStorage.getItem(LEGACY_KEY));}catch(e){}
      const id=uid();
      return{active:id,plans:{[id]:{id,name:'Plano 1',created:Date.now(),updated:Date.now(),thumb:null,state:isValid(legacy)?legacy:makeDefault()}}};
    }
    function persist(){
      try{localStorage.setItem(KEY,JSON.stringify(data));return true;}catch(e){return false;}
    }
    function uniqueName(base){
      const names=new Set(Object.values(data.plans).map(p=>p.name));
      if(!names.has(base))return base;
      let n=2;while(names.has(`${base} ${n}`))n++;
      return `${base} ${n}`;
    }
    function add(name,state,thumb=null){
      const id=uid();
      data.plans[id]={id,name:uniqueName(name),created:Date.now(),updated:Date.now(),thumb,state};
      data.active=id;persist();return data.plans[id];
    }

    return {
      get active(){return data.plans[data.active];},
      list:()=>Object.values(data.plans).sort((a,b)=>a.created-b.created),
      save(state){const p=data.plans[data.active];p.state=state;p.updated=Date.now();return persist();},
      setThumb(url){data.plans[data.active].thumb=url;persist();},
      open(id){if(!data.plans[id])return null;data.active=id;persist();return data.plans[id];},
      add,
      // marks a plan as uploaded: from then on it is opened through its own route
      setRemote(id,remote){const p=data.plans[id];if(p){p.remote=remote;persist();}},
      startFresh(makeBlank,isPristine){
        const reusable=this.list().find(p=>isPristine(p.state));
        if(reusable){data.active=reusable.id;persist();return{plan:reusable,created:false};}
        return{plan:add('Plano nuevo',makeBlank()),created:true};
      },
      duplicate(id){const p=data.plans[id];return p&&add(`${p.name} (copia)`,clone(p.state),p.thumb);},
      rename(id,name){const p=data.plans[id],clean=name.trim().slice(0,40);if(p&&clean){p.name=clean;persist();}return p;},
      remove(id){
        if(Object.keys(data.plans).length<=1||!data.plans[id])return null;
        delete data.plans[id];
        if(data.active===id)data.active=this.list()[0].id;
        persist();return this.active;
      },
      exportJson(id){const p=data.plans[id];return JSON.stringify({app:EXPORT_APP,version:2,name:p.name,state:p.state},null,1);},
      importJson(text){
        const parsed=JSON.parse(text),state=parsed.state||parsed;
        if(!isValid(state))throw new Error('El archivo no es un plano válido');
        return add(parsed.name||'Plano importado',state);
      }
    };
  }

  return {create};
})();
