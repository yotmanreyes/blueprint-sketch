/* Editable floor-plan data: axis-aligned walls, openings attached to walls, floor slabs.
   Walls are stored normalized (x1<=x2, z1<=z2); an opening's `pos` is measured from the wall start. */
const Layout=(()=>{
  const EPS=1e-4,OPEN_TOP_MARGIN=.1,MIN_OPENING=.3,OPENING_EDGE=.05;
  const near=(a,b)=>Math.abs(a-b)<EPS;

  const isH=w=>near(w.z1,w.z2);
  const axisOf=w=>isH(w)?'x':'z';
  const fixed=w=>isH(w)?w.z1:w.x1;
  const span=w=>isH(w)?[w.x1,w.x2]:[w.z1,w.z2];
  const length=w=>{const[a,b]=span(w);return b-a;};
  const wallById=(L,id)=>L.walls.find(w=>w.id===id);

  function normalize(w){
    if(isH(w)){if(w.x1>w.x2)[w.x1,w.x2]=[w.x2,w.x1];}
    else if(w.z1>w.z2)[w.z1,w.z2]=[w.z2,w.z1];
    return w;
  }
  const empty=()=>({walls:[],openings:[],floors:[],lights:[],tag:''});
  const isEmpty=L=>!L.walls.length&&!L.floors.length;

  function frame(L){
    const xs=[],zs=[];
    for(const w of L.walls){xs.push(w.x1,w.x2);zs.push(w.z1,w.z2);}
    for(const f of L.floors){xs.push(f.x-f.w/2,f.x+f.w/2);zs.push(f.z-f.d/2,f.z+f.d/2);}
    return xs.length?{x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs)}:null;
  }
  function floorsBounds(L){
    if(!L.floors.length)return null;
    return{x0:Math.min(...L.floors.map(f=>f.x-f.w/2)),x1:Math.max(...L.floors.map(f=>f.x+f.w/2)),
      z0:Math.min(...L.floors.map(f=>f.z-f.d/2)),z1:Math.max(...L.floors.map(f=>f.z+f.d/2))};
  }
  // usable area: floors bounds minus the half thickness of the walls running along each edge
  function innerBounds(L){
    const b=floorsBounds(L);if(!b)return null;
    const half=(axis,edge)=>Math.max(0,...L.walls.filter(w=>axisOf(w)===axis&&near(fixed(w),edge)).map(w=>w.t/2));
    return{x0:b.x0+half('z',b.x0),x1:b.x1-half('z',b.x1),z0:b.z0+half('x',b.z0),z1:b.z1-half('x',b.z1)};
  }

  // how a wall end meets the others: corner extension and how much each face is trimmed
  function endInfo(L,w,end){
    const[s0,s1]=span(w),c=fixed(w),along=end==='a'?s0:s1,h=isH(w);
    const touches=o=>{const[a,b]=span(o);return near(fixed(o),along)&&c>=a-EPS&&c<=b+EPS;};
    const perps=L.walls.filter(o=>o!==w&&axisOf(o)!==axisOf(w)&&touches(o));
    const continues=L.walls.some(o=>o!==w&&axisOf(o)===axisOf(w)&&near(fixed(o),c)&&(end==='a'?near(span(o)[1],along):near(span(o)[0],along)));
    const reach=perps.map(o=>({t:o.t,neg:span(o)[0]<c-EPS,pos:span(o)[1]>c+EPS}));
    const through=reach.some(r=>r.neg)&&reach.some(r=>r.pos);
    const half=pick=>Math.max(0,...reach.filter(pick).map(r=>r.t/2));
    return{ext:!continues&&!through&&perps.length?half(()=>true):0,trimLo:half(r=>r.neg),trimHi:half(r=>r.pos),horizontal:h};
  }

  function opsOf(L,w){
    const[s0]=span(w);
    return L.openings.filter(o=>o.wall===w.id).map(o=>({a:s0+o.pos,b:s0+o.pos+o.w,y0:o.sill,y1:o.sill+o.h}));
  }
  const overlaps=(L,o)=>L.openings.some(p=>p!==o&&p.wall===o.wall&&p.pos<o.pos+o.w&&o.pos<p.pos+p.w);

  function fitOpening(L,o,wallHeight){
    const w=wallById(L,o.wall);if(!w)return false;
    const len=length(w);
    o.w=Math.max(MIN_OPENING,Math.min(o.w,len-2*OPENING_EDGE));
    o.pos=Math.max(OPENING_EDGE,Math.min(o.pos,len-o.w-OPENING_EDGE));
    o.h=Math.min(o.h,wallHeight-OPEN_TOP_MARGIN-o.sill);
    return len>=MIN_OPENING+2*OPENING_EDGE;
  }
  function refitWallOpenings(L,w,wallHeight){
    L.openings=L.openings.filter(o=>o.wall!==w.id||fitOpening(L,o,wallHeight));
  }

  function nearestWall(L,x,z,maxDist){
    let best=null;
    for(const w of L.walls){
      const[s0,s1]=span(w),px=isH(w)?x:z,off=Math.abs((isH(w)?z:x)-fixed(w));
      const outside=px<s0?s0-px:px>s1?px-s1:0,d=Math.hypot(off,outside);
      if(d<=maxDist&&(!best||d<best.dist))best={wall:w,dist:d,at:px-s0};
    }
    return best;
  }

  // resizes a floor and drags along the walls that run on its edges, so a drawn room stays closed
  function resizeFloor(L,f,rect,wallHeight){
    const EDGE=.01,r3=n=>+n.toFixed(3);
    rect={x0:r3(rect.x0),x1:r3(rect.x1),z0:r3(rect.z0),z1:r3(rect.z1)};
    const old={x0:f.x-f.w/2,x1:f.x+f.w/2,z0:f.z-f.d/2,z1:f.z+f.d/2},touched=new Set();
    for(const w of L.walls){
      const h=isH(w),[a,b]=span(w),c=fixed(w);
      const lo=h?old.x0:old.z0,hi=h?old.x1:old.z1,edgeLo=h?old.z0:old.x0,edgeHi=h?old.z1:old.x1;
      if(a<lo-EDGE||b>hi+EDGE)continue;
      const onLo=Math.abs(c-edgeLo)<EDGE,onHi=Math.abs(c-edgeHi)<EDGE;
      if(!onLo&&!onHi)continue;
      const to=h?(onLo?rect.z0:rect.z1):(onLo?rect.x0:rect.x1);
      if(h)w.z1=w.z2=to;else w.x1=w.x2=to;
      const [k1,k2]=h?['x1','x2']:['z1','z2'];
      if(Math.abs(a-lo)<EDGE)w[k1]=h?rect.x0:rect.z0;
      if(Math.abs(b-hi)<EDGE)w[k2]=h?rect.x1:rect.z1;
      touched.add(w);
    }
    Object.assign(f,{x:r3((rect.x0+rect.x1)/2),z:r3((rect.z0+rect.z1)/2),w:r3(rect.x1-rect.x0),d:r3(rect.z1-rect.z0)});
    for(const w of touched)refitWallOpenings(L,w,wallHeight);
  }

  const faceIds=L=>[...new Set(L.walls.flatMap(w=>[w.faces&&w.faces.lo,w.faces&&w.faces.hi]).filter(Boolean))];

  // sorted unique centerline coordinates of the perpendicular walls inside the frame, for dimension chains
  function splits(L,axis){
    const f=frame(L);if(!f)return[];
    const [lo,hi]=axis==='x'?[f.x0,f.x1]:[f.z0,f.z1];
    const cs=L.walls.filter(w=>axisOf(w)!==axis).map(fixed).filter(v=>v>lo+EPS&&v<hi-EPS);
    return [...new Set([lo,...cs.map(v=>+v.toFixed(3)),hi])].sort((a,b)=>a-b);
  }

  // the original room + bathroom + corridor, expressed as data
  function house({win,floor}){
    const W=(id,x1,z1,x2,z2,t,faces)=>({id,x1,z1,x2,z2,t,faces});
    const walls=[
      W('w_back_bath',0,0,2.8,0,.15,{hi:'b_fondo'}),W('w_back_hall',2.8,0,4,0,.15,{hi:'p_resto'}),
      W('w_left_bath',0,0,0,4,.15,{hi:'b_izq'}),W('w_left_room',0,4,0,8,.15,{hi:'c_izq'}),
      W('w_front',0,8,4,8,.15,{lo:'c_ent'}),
      W('w_right_room',4,4,4,8,.15,{lo:'c_der'}),W('w_right_hall',4,0,4,4,.15,{lo:'p_resto'}),
      W('w_mid_bath',0,4,2.8,4,.15,{lo:'b_cuarto',hi:'c_bano'}),W('w_mid_hall',2.8,4,4,4,.15,{lo:'p_resto',hi:'c_bano'}),
      W('w_new',2.8,0,2.8,4,.1,{lo:'b_nuevo',hi:'p_nuevo'})
    ];
    const inBath=win.pos+win.w/2<4;
    const openings=[
      {id:'o_entry',wall:'w_front',pos:2.7,w:.8,h:2.1,sill:0,kind:'door'},
      {id:'o_hall_door',wall:'w_mid_hall',pos:.2,w:.8,h:2.1,sill:0,kind:'door'},
      {id:'o_bath_door',wall:'w_new',pos:1.7,w:.7,h:2.1,sill:0,kind:'door'},
      {id:'o_window',wall:inBath?'w_left_bath':'w_left_room',pos:inBath?win.pos:win.pos-4,w:win.w,h:win.h,sill:win.sill,kind:'window'}
    ];
    const floors=[
      {id:'f_room',x:2,z:6,w:4,d:4,f:floor.main,name:'Cuarto',zone:'cuarto'},
      {id:'f_hall',x:3.4,z:2,w:1.2,d:4,f:floor.main,name:'Pasillo',zone:'pasillo'},
      {id:'f_bath',x:1.4,z:2,w:2.8,d:4,f:floor.bano,name:'Baño',zone:'bano'}
    ];
    const lights=[[2,6,.45],[1.3,7.2,.75],[3.4,1,.4],[3.4,3,.4],[1.4,2.2,.35]].map(([x,z,drop])=>({x,z,drop}));
    return{walls,openings,floors,lights,tag:'house'};
  }

  return{isH,axisOf,fixed,span,length,wallById,normalize,empty,isEmpty,frame,floorsBounds,innerBounds,endInfo,opsOf,overlaps,
    fitOpening,refitWallOpenings,nearestWall,resizeFloor,faceIds,splits,house};
})();
if(typeof module!=='undefined')module.exports=Layout;
