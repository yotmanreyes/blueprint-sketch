/* Storeys of a plan. The level being edited lives in state.layout and state.items, so everything that
   edits a plan keeps working on it; the other levels are parked in state.levels until they are opened.
   The entry of the open level holds only its id and name. */
const Levels=(()=>{
  const MAX_LEVELS=8,NAME_MAX=30,WALL_HEIGHT=2.4,SLAB=.2,PITCH=WALL_HEIGHT+SLAB;

  function ensure(state){
    if(!Array.isArray(state.levels)||!state.levels.length){state.levels=[{id:'l1',name:'Planta baja'}];state.level=0;}
    if(!Number.isInteger(state.level)||state.level<0||state.level>=state.levels.length)state.level=0;
    state.layout.stairs=state.layout.stairs||[];Layout.ensureLayers(state.layout);
    state.levels.forEach((l,i)=>{
      if(i===state.level){delete l.layout;delete l.items;return;}
      l.layout=l.layout||Layout.empty();l.layout.stairs=l.layout.stairs||[];Layout.ensureLayers(l.layout);l.items=l.items||[];
    });
    return state;
  }

  const count=state=>state.levels.length;
  const layoutOf=(state,i)=>i===state.level?state.layout:state.levels[i].layout;
  const itemsOf=(state,i)=>i===state.level?state.items:state.levels[i].items;
  const at=(state,i)=>({index:i,id:state.levels[i].id,name:state.levels[i].name,layout:layoutOf(state,i),items:itemsOf(state,i)});
  const list=state=>state.levels.map((_,i)=>at(state,i));
  const allItems=state=>list(state).flatMap(l=>l.items);
  // the stairs that arrive on a level, coming from the one below
  const arriving=(state,i)=>i>0?layoutOf(state,i-1).stairs:[];
  const offset=(i,active)=>(i-active)*PITCH;

  function switchTo(state,i){
    if(i===state.level||i<0||i>=state.levels.length)return false;
    const open=state.levels[state.level];
    open.layout=state.layout;open.items=state.items;
    const next=state.levels[i];
    state.layout=next.layout;state.items=next.items;
    delete next.layout;delete next.items;
    state.level=i;
    return true;
  }

  const cleanName=name=>String(name).trim().slice(0,NAME_MAX);
  function add(state,nextId){
    if(state.levels.length>=MAX_LEVELS)return -1;
    const n=state.levels.length;
    state.levels.push({id:nextId('l'),name:n===0?'Planta baja':`Nivel ${n}`,layout:Layout.empty(),items:[]});
    return n;
  }

  function rename(state,i,name){
    const clean=cleanName(name);
    if(clean)state.levels[i].name=clean;
  }

  // removing a level also removes the stairs that led up to it
  function remove(state,i){
    if(state.levels.length<2||i<0||i>=state.levels.length)return false;
    if(i===state.level)switchTo(state,i>0?i-1:1);
    if(i>0)layoutOf(state,i-1).stairs=[];
    state.levels.splice(i,1);
    if(i<state.level)state.level--;
    return true;
  }

  // copies the walls and floors of a level into the open one, keeping their finishes
  function copyStructure(state,from,nextId){
    if(from===state.level)return 0;
    const source=layoutOf(state,from),target=state.layout,faces=new Map();
    const face=old=>{
      if(!old)return old;
      if(!faces.has(old)){const id=nextId('s');faces.set(old,id);if(state.walls[old])state.walls[id]={...state.walls[old]};}
      return faces.get(old);
    };
    for(const w of source.walls)target.walls.push({...w,layer:undefined,id:nextId('w'),faces:{lo:face(w.faces&&w.faces.lo),hi:face(w.faces&&w.faces.hi)}});
    for(const f of source.floors)target.floors.push({...f,layer:undefined,id:nextId('f')});
    return source.walls.length+source.floors.length;
  }

  // bounding box of every level, so an empty level still opens over the building below it
  function frame(state){
    const frames=list(state).map(l=>Layout.frame(l.layout)).filter(Boolean);
    return frames.length?{x0:Math.min(...frames.map(f=>f.x0)),x1:Math.max(...frames.map(f=>f.x1)),z0:Math.min(...frames.map(f=>f.z0)),z1:Math.max(...frames.map(f=>f.z1))}:null;
  }

  return{ensure,count,layoutOf,itemsOf,at,list,allItems,arriving,offset,switchTo,add,rename,remove,copyStructure,frame,cleanName,
    MAX_LEVELS,NAME_MAX,WALL_HEIGHT,SLAB,PITCH};
})();
if(typeof module!=='undefined')module.exports=Levels;
