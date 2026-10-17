/* Imported 3D models (.glb): kept in this browser's IndexedDB, measured and normalised on import
   (metres, centred on the floor, front towards +z) and instanced into the scene.
   Files may come from anyone, so they are size-limited, self-contained and checked before use. */
const Models=(()=>{
  const DB_NAME='bs-models-v1',STORE='models';
  const MAX_FILE_BYTES=15e6,MAX_VERTICES=600000,MAX_SIDE_M=20,MIN_SIDE_M=.02,THUMB_PX=96,ID_PREFIX='m_';
  const MM_ABOVE=350,CM_ABOVE=8;                       // a piece larger than this (in file units) was exported in mm / cm
  const GLB_MAGIC=0x46546c67;                          // "glTF"

  const round3=n=>+n.toFixed(3);

  // Scale, size and offset that turn a model's bounding box into metres, centred, resting on the floor.
  function fit(min,max){
    const size={x:max.x-min.x,y:max.y-min.y,z:max.z-min.z},biggest=Math.max(size.x,size.y,size.z);
    if(!(biggest>0)||!Number.isFinite(biggest))return null;
    const scale=biggest>MM_ABOVE?.001:biggest>CM_ABOVE?.01:1;
    const w=size.x*scale,h=size.y*scale,d=size.z*scale;
    if(Math.max(w,h,d)>MAX_SIDE_M)return null;
    const clamp=n=>Math.max(MIN_SIDE_M,n);
    return{scale,w:round3(clamp(w)),d:round3(clamp(d)),h:round3(clamp(h)),
      offset:{x:-(min.x+max.x)/2*scale,y:-min.y*scale,z:-(min.z+max.z)/2*scale}};
  }
  const newId=()=>ID_PREFIX+Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>b.toString(16).padStart(2,'0')).join('');
  const isValidId=id=>/^m_[a-z0-9]{6,20}$/.test(id);
  const cleanName=file=>String(file).replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N} _.-]+/gu,' ').replace(/\s+/g,' ').trim().slice(0,40)||'Modelo';

  /* ---------- storage (IndexedDB) ---------- */
  let dbPromise=null;
  const db=()=>dbPromise??=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>req.result.createObjectStore(STORE,{keyPath:'id'});
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  async function run(mode,work){
    const d=await db();
    return new Promise((resolve,reject)=>{
      const t=d.transaction(STORE,mode),request=work(t.objectStore(STORE));
      t.oncomplete=()=>resolve(request&&request.result);
      t.onerror=t.onabort=()=>reject(t.error);
    });
  }
  const readRecord=id=>run('readonly',s=>s.get(id));
  const writeRecord=record=>run('readwrite',s=>s.put(record));
  const meta=({id,name,w,d,h,bytes,thumb,added})=>({id,name,w,d,h,bytes,thumb,added});
  const list=async()=>(await run('readonly',s=>s.getAll())||[]).map(meta).sort((a,b)=>b.added-a.added);

  /* ---------- parsing ---------- */
  function loader(){
    const manager=new THREE.LoadingManager();
    // a model must carry everything it needs: anything that is not embedded is never fetched
    manager.setURLModifier(url=>/^(data:|blob:)/.test(url)?url:'data:,');
    return new THREE.GLTFLoader(manager);
  }
  const parse=buffer=>new Promise((resolve,reject)=>loader().parse(buffer,'',resolve,reject));

  function countVertices(scene){
    let n=0;
    scene.traverse(o=>{if(o.isMesh&&o.geometry&&o.geometry.attributes.position)n+=o.geometry.attributes.position.count;});
    return n;
  }
  function dispose(scene){
    scene.traverse(o=>{
      if(o.geometry)o.geometry.dispose();
      for(const m of[].concat(o.material||[])){for(const k in m)if(m[k]&&m[k].isTexture)m[k].dispose();m.dispose();}
    });
  }

  // wraps the parsed scene so its box is w x h x d metres, centred on x/z with its base at y = 0
  function normalise(scene){
    scene.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(scene),result=fit(box.min,box.max);
    if(!result)throw new Error('El modelo está vacío o tiene un tamaño imposible.');
    const holder=new THREE.Group();
    scene.position.set(result.offset.x/result.scale,result.offset.y/result.scale,result.offset.z/result.scale);
    const inner=new THREE.Group();inner.add(scene);inner.scale.setScalar(result.scale);
    holder.add(inner);
    return{holder,dims:{w:result.w,d:result.d,h:result.h}};
  }

  function thumbnail(holder,{w,d,h}){
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
    renderer.setSize(THUMB_PX,THUMB_PX);renderer.outputEncoding=THREE.sRGBEncoding;
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.05,100);
    scene.add(new THREE.HemisphereLight(0xffffff,0x777777,1.1));
    const sun=new THREE.DirectionalLight(0xffffff,1.1);sun.position.set(2,4,3);scene.add(sun);
    const copy=holder.clone(true);scene.add(copy);
    const radius=Math.max(w,d,h)*1.9;
    camera.position.set(radius*.8,h/2+radius*.55,radius*.9);camera.lookAt(0,h/2,0);
    renderer.render(scene,camera);
    const url=renderer.domElement.toDataURL('image/png');
    renderer.dispose();if(renderer.forceContextLoss)renderer.forceContextLoss();
    return url;
  }

  /* ---------- scene cache ---------- */
  const parsed=new Map(),status=new Map(),waiting=new Set();
  function adopt(id,holder){
    holder.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    parsed.set(id,holder);status.set(id,'ready');
  }
  async function ensure(id){
    if(status.has(id))return;                         // ready, loading, missing and broken models are not retried
    status.set(id,'loading');
    try{
      const record=await readRecord(id);
      if(!record)status.set(id,'missing');
      else adopt(id,normalise((await parse(record.data)).scene).holder);
    }catch(e){status.set(id,'broken');}
    waiting.forEach(cb=>cb(id));
  }
  // a fresh instance if the model is ready (geometry and materials are shared), otherwise null and a load starts
  function instance(id){
    const holder=parsed.get(id);
    if(holder)return holder.clone(true);
    ensure(id);
    return null;
  }
  const stateOf=id=>status.get(id)||'unknown';
  const onReady=cb=>{waiting.add(cb);return()=>waiting.delete(cb);};

  /* ---------- import / remove ---------- */
  async function importFile(file){
    if(!/\.glb$/i.test(file.name))throw new Error('Usa un archivo .glb (el .gltf suelto necesita archivos aparte).');
    if(file.size>MAX_FILE_BYTES)throw new Error(`El archivo pesa más de ${MAX_FILE_BYTES/1e6} MB.`);
    const data=await file.arrayBuffer();
    if(data.byteLength<12||new DataView(data).getUint32(0,true)!==GLB_MAGIC)throw new Error('No es un archivo .glb válido.');
    let gltf;
    try{gltf=await parse(data);}
    catch(e){throw new Error(/draco|ktx|meshopt/i.test(String(e&&e.message))?'El modelo usa compresión que todavía no se soporta (Draco, KTX2 o Meshopt).':'No se pudo leer el modelo. Debe ser un .glb autocontenido, con las texturas incrustadas.');}
    if(countVertices(gltf.scene)>MAX_VERTICES){dispose(gltf.scene);throw new Error('El modelo es demasiado pesado (más de 600.000 vértices).');}
    const{holder,dims}=normalise(gltf.scene);
    const id=newId(),record={id,name:cleanName(file.name),...dims,bytes:data.byteLength,thumb:thumbnail(holder,dims),added:Date.now(),data};
    await writeRecord(record);
    adopt(id,holder);
    return meta(record);
  }
  async function remove(id){
    await run('readwrite',s=>s.delete(id));
    const holder=parsed.get(id);
    if(holder)dispose(holder);
    parsed.delete(id);status.set(id,'missing');
    waiting.forEach(cb=>cb(id));
  }
  const bytesOf=async id=>{const r=await readRecord(id);return r&&r.data;};
  // stores a model that came from somewhere else (a shared plan)
  async function store(id,name,dims,data){
    const holder=normalise((await parse(data)).scene).holder;
    await writeRecord({id,name,...dims,bytes:data.byteLength,thumb:thumbnail(holder,dims),added:Date.now(),data});
    adopt(id,holder);
  }

  return{fit,isValidId,cleanName,list,importFile,remove,instance,ensure,stateOf,onReady,bytesOf,store,MAX_FILE_BYTES};
})();
if(typeof module!=='undefined')module.exports=Models;
