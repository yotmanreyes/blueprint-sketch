/* Shared plans: API client, per-browser token storage and the live session of an open shared plan.
   A link looks like /p/<planId>#k=<token>; the token (kept in the fragment, so it never reaches
   server logs) grants one role: owner, editor or viewer. */
const Sharing=(()=>{
  const TOKENS_KEY='bs-tokens-v1',KNOWN_KEY='bs-known-v1';
  const SAVE_DELAY_MS=800,POLL_MS=8000;
  const ROLE_NAMES={owner:'Propietario',editor:'Editor',viewer:'Lector'};

  const read=key=>{try{return JSON.parse(localStorage.getItem(key))||{};}catch(e){return{};}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch(e){}};

  const routeId=()=>{const m=/^\/p\/([A-Za-z0-9_-]{1,40})\/?$/.exec(location.pathname);return m&&m[1];};
  // a browser may hold several links to one plan (for example the owner opening a reader link):
  // all are kept and the one with the highest role is used
  const ROLE_RANK={viewer:1,editor:2,owner:3},MAX_TOKENS_PER_PLAN=5;
  const tokenList=id=>{const v=read(TOKENS_KEY)[id];return Array.isArray(v)?v:v?[v]:[];};
  const saveToken=(id,token)=>write(TOKENS_KEY,{...read(TOKENS_KEY),[id]:[token,...tokenList(id).filter(t=>t!==token)].slice(0,MAX_TOKENS_PER_PLAN)});
  const dropToken=(id,token)=>write(TOKENS_KEY,{...read(TOKENS_KEY),[id]:tokenList(id).filter(t=>t!==token)});
  const forgetToken=id=>{const t=read(TOKENS_KEY);delete t[id];write(TOKENS_KEY,t);};
  const hasToken=id=>tokenList(id).length>0;
  const active={};
  const tokenFor=id=>active[id]||tokenList(id)[0]||null;
  const shareUrl=(id,token)=>`${location.origin}/p/${id}#k=${token}`;

  // takes a token from the address (#k=...), keeps it and cleans the address bar
  function adoptFragmentToken(id){
    const m=/^#k=([A-Za-z0-9_-]{20,64})$/.exec(location.hash);
    if(!m)return;
    saveToken(id,m[1]);
    history.replaceState(null,'',location.pathname);
  }

  const known=()=>Object.entries(read(KNOWN_KEY)).map(([id,v])=>({id,...v})).sort((a,b)=>b.seen-a.seen);
  const remember=(id,name,role)=>write(KNOWN_KEY,{...read(KNOWN_KEY),[id]:{name,role,seen:Date.now()}});
  const forget=id=>{const k=read(KNOWN_KEY);delete k[id];write(KNOWN_KEY,k);forgetToken(id);};

  async function call(method,path,{token,body}={}){
    try{
      const res=await fetch(path,{method,cache:'no-store',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
      let data=null;
      try{data=await res.json();}catch(e){}
      return{status:res.status,ok:res.ok,data};
    }catch(e){
      return{status:0,ok:false,data:null};
    }
  }

  async function create(name,state){
    const r=await call('POST','/api/plans',{body:{name,state}});
    if(r.ok){saveToken(r.data.id,r.data.token);remember(r.data.id,name,'owner');}
    return r;
  }
  const links=id=>call('GET',`/api/plans/${id}/links`,{token:tokenFor(id)});
  const createLink=(id,role,label)=>call('POST',`/api/plans/${id}/links`,{token:tokenFor(id),body:{role,label}});
  const revokeLink=(id,lid)=>call('DELETE',`/api/plans/${id}/links/${lid}`,{token:tokenFor(id)});
  const remove=async id=>{const r=await call('DELETE',`/api/plans/${id}`,{token:tokenFor(id)});if(r.ok)forget(id);return r;};

  // live connection to one shared plan: autosave, change polling and conflict handling
  function session(id,hooks){
    let version=0,role=null,name='',dirty=false,saving=false,conflict=false,saveTimer=null,pollTimer=null,nameDirty=false,editRev=0;
    const token=()=>tokenFor(id);
    const status=s=>hooks.onStatus&&hooks.onStatus(s);

    async function load(){
      let best=null,failure=null;
      for(const t of tokenList(id)){
        const r=await call('GET',`/api/plans/${id}`,{token:t});
        if(r.status===404||r.status===403)dropToken(id,t);
        if(!r.ok){failure=failure||r;continue;}
        if(!best||ROLE_RANK[r.data.role]>ROLE_RANK[best.r.data.role])best={t,r};
      }
      if(!best)return failure||{ok:false,status:404,data:null};
      active[id]=best.t;
      const r=best.r;
      version=r.data.version;role=r.data.role;name=r.data.name;
      remember(id,name,role);
      return r;
    }
    async function flush(){
      if(!dirty||saving||conflict||role==='viewer')return;
      saving=true;status('saving');
      const sent=editRev,body={state:hooks.getState(),baseVersion:version};
      if(nameDirty)body.name=name;
      const r=await call('PUT',`/api/plans/${id}`,{token:token(),body});
      saving=false;
      if(r.ok){version=r.data.version;dirty=editRev!==sent;nameDirty=dirty&&nameDirty;status(dirty?'pending':'saved');}
      else if(r.status===409){conflict=true;status('conflict');}
      else if(r.status===403||r.status===404){status('denied');}
      else status('offline');
      if(dirty&&!conflict&&r.ok)queueSave();
      if(!r.ok&&r.status!==409&&r.status!==403&&r.status!==404)saveTimer=setTimeout(flush,POLL_MS);
    }
    function queueSave(){
      if(role==='viewer')return;
      dirty=true;editRev++;clearTimeout(saveTimer);
      saveTimer=setTimeout(flush,SAVE_DELAY_MS);
      status('pending');
    }
    async function poll(){
      if(document.visibilityState!=='visible'||saving)return;
      const r=await call('GET',`/api/plans/${id}?since=${version}`,{token:token()});
      if(r.status===404||r.status===403){status('denied');return;}
      if(!r.ok||r.data.unchanged)return;
      if(dirty||conflict){conflict=true;status('conflict');return;}
      version=r.data.version;role=r.data.role;name=r.data.name;
      hooks.onRemote(r.data);
    }
    const start=()=>{pollTimer=setInterval(poll,POLL_MS);};
    const stop=()=>{clearInterval(pollTimer);clearTimeout(saveTimer);};
    async function resolve(keep){
      conflict=false;
      if(keep==='mine'){
        saving=true;
        const r=await call('PUT',`/api/plans/${id}`,{token:token(),body:{state:hooks.getState(),baseVersion:version,force:true}});
        saving=false;
        if(r.ok){version=r.data.version;dirty=false;status('saved');}else status('offline');
        return;
      }
      dirty=false;
      const r=await load();
      if(r.ok){hooks.onRemote(r.data);status('saved');}
      else status('offline');
    }
    const rename=newName=>{name=newName;nameDirty=true;queueSave();};
    return{load,queueSave,start,stop,resolve,rename,flush,
      get role(){return role;},get name(){return name;},get version(){return version;}};
  }

  return{ROLE_NAMES,routeId,hasToken,tokenFor,adoptFragmentToken,shareUrl,known,remember,forget,create,links,createLink,revokeLink,remove,session};
})();
