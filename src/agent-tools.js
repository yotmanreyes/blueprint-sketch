/* What an AI agent may do to a plan. Every tool goes through the same model the editor uses (walls, floors, openings,
   stairs, pieces, levels, layers), so a plan built by an agent is an ordinary plan. The editor's assistant and the MCP
   server share this file; neither draws anything by itself. */
const Agent=(()=>{
  const SNAP=.05,WALL=.15,MIN_WALL=.3,MAX_COORD=200,MAX_LIST=300,HALF=WALL/2;
  const TURN_SIDES={north:0,west:1,south:2,east:3};
  const FINISH_SPEC=key=>key.startsWith('enchape-')?{t:'enchape',p:key.slice(8)}:{t:key};
  const COLOR=/^#[0-9a-fA-F]{6}$/;

  const GUIDE=`You are building a floor plan in Blueprint Sketch. Reply to the person in their own language.
Coordinates are metres in plan view: x grows to the right (east), z grows downwards (south), y is height. Everything snaps to 5 cm.
Walls are axis-aligned only (no diagonals), 0.15 m thick by default, 2.4 m high. A room is a floor rectangle plus walls around it;
floors must never overlap, so tile an irregular space with several rectangles. Doors and windows belong to a wall: give a point on or near it.
Pieces (furniture, trees...) are placed by their centre; "turns" rotates them in quarter turns: 0 = back to the north wall facing south,
1 = back to the west wall, 2 = back to the south wall, 3 = back to the east wall. Prefer place_against_wall for anything that stands against a wall.
Levels stack 2.6 m apart; a stair belongs to the level where it starts and needs a level above. Layers can be hidden or locked.
Work like a person would: look first (get_plan, list_catalog), build room by room, then run check_plan and fix what it reports before you say you are done.
Prefer standard sizes. Do not delete or replace what the person already drew unless they asked for it.`;

  class AgentError extends Error{}
  const fail=message=>{throw new AgentError(message);};

  const round=v=>+v.toFixed(3),scale=v=>+v.toFixed(5);
  const snap=v=>round(Math.round(v/SNAP)*SNAP);
  function num(args,key,{def,min=-MAX_COORD,max=MAX_COORD,snapped=false}={}){
    let v=args[key];
    if(v===undefined||v===null||v===''){if(def!==undefined)return def;fail(`"${key}" is required`);}
    v=Number(v);
    if(!Number.isFinite(v))fail(`"${key}" must be a number`);
    if(v<min||v>max)fail(`"${key}" must be between ${min} and ${max}`);
    return snapped?snap(v):v;
  }
  function text(args,key,{def,max=30}={}){
    let v=args[key];
    if(v===undefined||v===null||v===''){if(def!==undefined)return def;fail(`"${key}" is required`);}
    v=String(v).trim();
    if(!v)fail(`"${key}" is required`);
    return v.slice(0,max);
  }
  const choice=(args,key,options,def)=>{
    const v=args[key]===undefined?def:args[key];
    if(!options.includes(v))fail(`"${key}" must be one of: ${options.join(', ')}`);
    return v;
  };
  const rect4=(args,{min=.5}={})=>{
    const a=num(args,'x0',{snapped:true}),b=num(args,'x1',{snapped:true}),c=num(args,'z0',{snapped:true}),d=num(args,'z1',{snapped:true});
    const r={x0:Math.min(a,b),x1:Math.max(a,b),z0:Math.min(c,d),z1:Math.max(c,d)};
    if(r.x1-r.x0<min||r.z1-r.z0<min)fail(`the rectangle must be at least ${min} m on each side`);
    return r;
  };

  const next=(env,prefix)=>prefix+(++env.state.n);
  const layout=env=>env.state.layout;
  const floorRect=f=>({x0:f.x-f.w/2,x1:f.x+f.w/2,z0:f.z-f.d/2,z1:f.z+f.d/2});
  const overlap=(a,b)=>Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.z1,b.z1)-Math.max(a.z0,b.z0));
  const lib=type=>Catalog.LIB[type];
  function pieceType(type){
    const L=lib(String(type));
    if(!L||L.custom)fail(`unknown piece "${type}"; call list_catalog for the valid ones`);
    return L;
  }
  function itemRect(it){
    const L=lib(it.t),w=L.w*(it.sx||1),d=L.d*(it.sz||1),t=(it.r*90+(it.a||0))*Math.PI/180,c=Math.abs(Math.cos(t)),s=Math.abs(Math.sin(t));
    const hx=(c*w+s*d)/2,hz=(s*w+c*d)/2;
    return{x0:it.x-hx,x1:it.x+hx,z0:it.z-hz,z1:it.z+hz};
  }
  const itemSize=it=>({width:round(lib(it.t).w*(it.sx||1)),depth:round(lib(it.t).d*(it.sz||1))});

  /* ---------- reading ---------- */
  const describeWall=w=>({id:w.id,x1:w.x1,z1:w.z1,x2:w.x2,z2:w.z2,thickness:w.t,...(w.layer?{layer:w.layer}:{})});
  function describeOpening(L,o){
    const w=Layout.wallById(L,o.wall),a=w?Layout.span(w)[0]+o.pos+o.w/2:null;
    return{id:o.id,kind:o.kind,wall:o.wall,center:w?(Layout.isH(w)?{x:round(a),z:Layout.fixed(w)}:{x:Layout.fixed(w),z:round(a)}):null,width:o.w,height:o.h,sill:o.sill,...(o.layer?{layer:o.layer}:{})};
  }
  const describeFloor=f=>({id:f.id,name:f.name,...Object.fromEntries(Object.entries(floorRect(f)).map(([k,v])=>[k,round(v)])),area:round(f.w*f.d),finish:f.f,...(f.c?{ceiling:f.c}:{}),...(f.layer?{layer:f.layer}:{})});
  const describeStair=s=>({id:s.id,x:s.x,z:s.z,width:s.w,length:s.d,turns:s.r,climbs:['south','east','north','west'][s.r],...(s.layer?{layer:s.layer}:{})});
  const describeItem=it=>({id:it.id,type:it.t,name:lib(it.t).n,x:it.x,z:it.z,turns:it.r,...(it.a?{angle:it.a}:{}),...itemSize(it),...(it.layer?{layer:it.layer}:{})});

  function levelSummary(env,lv){
    const L=lv.layout,F=Layout.frame(L);
    return{index:lv.index,name:lv.name,open:lv.index===env.state.level,rooms:L.floors.length,walls:L.walls.length,openings:L.openings.length,stairs:L.stairs.length,pieces:lv.items.length,
      bounds:F?{x0:round(F.x0),x1:round(F.x1),z0:round(F.z0),z1:round(F.z1)}:null};
  }

  /* ---------- tools ---------- */
  const T=[];
  const tool=(name,description,properties,required,mutates,run)=>T.push({name,description,mutates,parameters:{type:'object',properties,required},run});
  const number=description=>({type:'number',description});
  const str=description=>({type:'string',description});
  const bool=description=>({type:'boolean',description});
  const rectProps={x0:number('west edge, metres'),z0:number('north edge, metres'),x1:number('east edge, metres'),z1:number('south edge, metres')};
  const KINDS=['wall','opening','floor','stair','item'];

  tool('get_plan','Summary of the plan: the open level, every level, its size and counts. Start here.',{},[],false,env=>({
    style:env.state.style,openLevel:env.state.level,levels:Levels.list(env.state).map(lv=>levelSummary(env,lv)),
    rooms:layout(env).floors.map(describeFloor),layers:layout(env).layers.map(l=>({id:l.id,name:l.name,visible:l.visible!==false,locked:!!l.locked}))
  }));

  tool('list_elements','List the elements of one kind on the open level, with their ids, to edit or delete them.',
    {kind:{type:'string',enum:['walls','openings','floors','stairs','items'],description:'what to list'}},['kind'],false,(env,args)=>{
      const kind=choice(args,'kind',['walls','openings','floors','stairs','items']),L=layout(env);
      const all=kind==='walls'?L.walls.map(describeWall):kind==='openings'?L.openings.map(o=>describeOpening(L,o)):kind==='floors'?L.floors.map(describeFloor)
        :kind==='stairs'?L.stairs.map(describeStair):env.state.items.filter(it=>lib(it.t)).map(describeItem);
      return{kind,total:all.length,elements:all.slice(0,MAX_LIST),truncated:all.length>MAX_LIST};
    });

  tool('list_catalog','Pieces you can place (with their standard sizes), floor finishes and wall finishes.',{},[],false,()=>({
    pieces:Object.entries(Catalog.LIB).filter(([,p])=>!p.custom).map(([id,p])=>{
      const std=Catalog.stdOf(id);
      return{id,name:p.n,width:p.w,depth:p.d,...(p.elev!==undefined?{hangsAt:p.elev}:{}),...(std?{standardSizes:std.sizes.map(([name,w,d])=>`${name} ${w}x${d}`),widthRange:std.w,depthRange:std.d,uniform:!!std.uniform}:{fixedSize:true})};
    }),
    floorFinishes:Catalog.FLOORS.map(([id,name,open])=>({id,name,outdoor:open})),wallFinishes:Catalog.WALL_FINISHES.map(([id,name])=>({id,name})),
    templates:Templates.CATALOG.map(t=>({key:t.key,name:t.name,category:t.category,levels:t.levels||1,description:t.description}))
  }));

  tool('check_plan','Look for problems: overlapping floors, pieces outside rooms or on top of each other, openings that do not fit, stairs without a landing. Run it before finishing.',{},[],false,env=>{
    const problems=[];
    for(const lv of Levels.list(env.state)){
      const at=text=>problems.push(`${lv.name}: ${text}`),L=lv.layout,rects=L.floors.map(floorRect);
      for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)
        if(overlap(rects[i],rects[j])>1e-6)at(`floors "${L.floors[i].name}" and "${L.floors[j].name}" overlap`);
      for(const o of L.openings){
        const w=Layout.wallById(L,o.wall);
        if(!w){at(`opening ${o.id} has no wall`);continue;}
        const probe={...o};
        if(!Layout.fitOpening(L,probe,Levels.WALL_HEIGHT)||Math.abs(probe.pos-o.pos)>1e-3||Math.abs(probe.w-o.w)>1e-3)at(`opening ${o.id} does not fit its wall`);
        if(Layout.overlaps(L,o))at(`opening ${o.id} overlaps another opening`);
      }
      const placed=lv.items.filter(it=>lib(it.t)).map(it=>({it,r:itemRect(it)}));
      for(const{it,r}of placed){
        const home=rects.find(f=>it.x>f.x0&&it.x<f.x1&&it.z>f.z0&&it.z<f.z1);
        if(!home)at(`${lib(it.t).n} ${it.id} at ${it.x},${it.z} is not on any floor`);
        else if(r.x0<home.x0-.01||r.x1>home.x1+.01||r.z0<home.z0-.01||r.z1>home.z1+.01)at(`${lib(it.t).n} ${it.id} at ${it.x},${it.z} sticks out of its room`);
      }
      for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
        const a=placed[i],b=placed[j];
        if(a.it.t==='tapete'||b.it.t==='tapete')continue;
        if(overlap(a.r,b.r)>4e-4)at(`${lib(a.it.t).n} ${a.it.id} overlaps ${lib(b.it.t).n} ${b.it.id}`);
      }
      for(const s of L.stairs){
        const r=Layout.stairRect(s);
        if(lv.index>=Levels.count(env.state)-1)at(`stair ${s.id} has no level above`);
        else if(!Levels.list(env.state)[lv.index+1].layout.floors.some(f=>{const q=floorRect(f);return r.x0>=q.x0-1e-6&&r.x1<=q.x1+1e-6&&r.z0>=q.z0-1e-6&&r.z1<=q.z1+1e-6;}))at(`stair ${s.id} does not land on a floor of the level above`);
      }
    }
    return{ok:problems.length===0,problems};
  });

  tool('get_quantities','Areas, finishes, doors, windows, stairs and furniture counted from the whole plan, with the budget when prices are set.',{},[],false,env=>{
    const q=Quantities.compute(env.state,{lib:Catalog.LIB});
    return{summary:q.summary,rooms:q.rooms,lines:q.lines.map(l=>({section:l.section,item:l.label,quantity:l.qty,unit:l.unit,total:l.total})),budget:q.budget};
  });

  tool('list_templates','Ready-made plans (houses, buildings, parks...) that apply_template can start from.',{},[],false,()=>({
    templates:Templates.CATALOG.map(t=>({key:t.key,name:t.name,category:t.category,levels:t.levels||1,description:t.description}))
  }));

  tool('apply_template','Replace the whole plan with a ready-made one to build on. Only use it on an empty plan or when the person asked for it, and then pass confirm_replace.',
    {key:str('template key from list_templates'),confirm_replace:bool('true when the current plan may be discarded')},['key'],true,(env,args)=>{
      const key=text(args,'key'),entry=Templates.CATALOG.find(t=>t.key===key);
      if(!entry)fail(`unknown template "${key}"`);
      const empty=Levels.list(env.state).every(l=>Layout.isEmpty(l.layout)&&!l.items.length);
      if(!empty&&args.confirm_replace!==true)fail('the plan is not empty; ask the person and pass confirm_replace: true to replace it');
      const keep={style:env.state.style};
      env.state=Templates.create(key,{blank:env.blank,example:env.example,lib:Catalog.LIB});
      Object.assign(env.state,{style:env.state.style||keep.style});
      return{applied:entry.name,levels:Levels.count(env.state)};
    });

  /* ---- building ---- */
  function addWallSegment(env,x1,z1,x2,z2,t){
    const L=layout(env),probe=Layout.normalize({x1,z1,x2,z2});
    const twin=L.walls.find(w=>Math.abs(w.x1-probe.x1)<1e-4&&Math.abs(w.z1-probe.z1)<1e-4&&Math.abs(w.x2-probe.x2)<1e-4&&Math.abs(w.z2-probe.z2)<1e-4);
    if(twin)return{id:twin.id,reused:true};
    const id=next(env,'w');
    L.walls.push(Layout.normalize({id,x1,z1,x2,z2,t,faces:{lo:id+'a',hi:id+'b'}}));
    return{id,reused:false};
  }
  const overlapsFloor=(env,r)=>layout(env).floors.find(f=>overlap(floorRect(f),r)>1e-6);

  tool('add_wall','Draw one straight wall, horizontal or vertical. Use add_room for closed rooms.',
    {x1:number('start x'),z1:number('start z'),x2:number('end x'),z2:number('end z'),thickness:number('metres, default 0.15')},['x1','z1','x2','z2'],true,(env,args)=>{
      const x1=num(args,'x1',{snapped:true}),z1=num(args,'z1',{snapped:true}),x2=num(args,'x2',{snapped:true}),z2=num(args,'z2',{snapped:true});
      if(x1!==x2&&z1!==z2)fail('walls must be horizontal or vertical: keep x1=x2 or z1=z2');
      if(Math.hypot(x2-x1,z2-z1)<MIN_WALL)fail(`a wall must be at least ${MIN_WALL} m long`);
      return addWallSegment(env,x1,z1,x2,z2,num(args,'thickness',{def:WALL,min:.05,max:.5}));
    });

  tool('add_room','Add a rectangular room: four walls and a floor. Rooms that share a side reuse the wall already there. Rooms must not overlap.',
    {...rectProps,name:str('room name'),floor:str('floor finish id from list_catalog, default marmol_blanco'),thickness:number('wall thickness, default 0.15')},['x0','z0','x1','z1'],true,(env,args)=>{
      const r=rect4(args,{min:1}),t=num(args,'thickness',{def:WALL,min:.05,max:.5});
      const finish=choice(args,'floor',Catalog.FLOORS.map(f=>f[0]),'marmol_blanco'),clash=overlapsFloor(env,r);
      if(clash)fail(`it overlaps the floor "${clash.name}"; shift or shrink it`);
      const walls=[addWallSegment(env,r.x0,r.z0,r.x1,r.z0,t),addWallSegment(env,r.x0,r.z1,r.x1,r.z1,t),addWallSegment(env,r.x0,r.z0,r.x0,r.z1,t),addWallSegment(env,r.x1,r.z0,r.x1,r.z1,t)];
      const f={id:next(env,'f'),x:round((r.x0+r.x1)/2),z:round((r.z0+r.z1)/2),w:round(r.x1-r.x0),d:round(r.z1-r.z0),f:finish,name:text(args,'name',{def:`Habitación ${layout(env).floors.length+1}`}),zone:''};
      layout(env).floors.push(f);
      return{floor:f.id,walls:walls.map(w=>w.id)};
    });

  tool('add_floor','Add a floor rectangle without walls (open spaces: garden, path, pool, terrace). Floors must not overlap.',
    {...rectProps,name:str('name'),finish:str('floor finish id from list_catalog')},['x0','z0','x1','z1'],true,(env,args)=>{
      const r=rect4(args,{min:.5}),finish=choice(args,'finish',Catalog.FLOORS.map(f=>f[0]),'marmol_blanco'),clash=overlapsFloor(env,r);
      if(clash)fail(`it overlaps the floor "${clash.name}"`);
      const f={id:next(env,'f'),x:round((r.x0+r.x1)/2),z:round((r.z0+r.z1)/2),w:round(r.x1-r.x0),d:round(r.z1-r.z0),f:finish,name:text(args,'name',{def:'Piso'}),zone:''};
      layout(env).floors.push(f);
      return{floor:f.id};
    });

  function addOpening(env,kind,args,spec){
    const L=layout(env),x=num(args,'x'),z=num(args,'z'),near=Layout.nearestWall(L,x,z,.6);
    if(!near)fail(`there is no wall within 0.6 m of ${x},${z}; draw the wall first or give a point on it`);
    const o={id:next(env,'o'),wall:near.wall.id,pos:0,w:num(args,'width',{def:spec.w,min:.3,max:6}),h:num(args,'height',{def:spec.h,min:.3,max:2.3}),
      sill:kind==='window'?num(args,'sill',{def:spec.sill,min:0,max:1.8}):0,kind};
    o.pos=snap(near.at-o.w/2);
    if(!Layout.fitOpening(L,o,Levels.WALL_HEIGHT))fail('the wall is too short for it');
    if(Layout.overlaps(L,o))fail('it would overlap another door or window on that wall; choose another spot');
    L.openings.push(o);
    return describeOpening(L,o);
  }
  tool('add_door','Put a door in the wall nearest to a point.',{x:number('x of a point on the wall'),z:number('z of a point on the wall'),width:number('default 0.9'),height:number('default 2.1')},['x','z'],true,
    (env,args)=>addOpening(env,'door',args,{w:.9,h:2.1}));
  tool('add_window','Put a window in the wall nearest to a point.',{x:number('x of a point on the wall'),z:number('z of a point on the wall'),width:number('default 1.2'),height:number('default 1.2'),sill:number('height of the sill, default 0.9')},['x','z'],true,
    (env,args)=>addOpening(env,'window',args,{w:1.2,h:1.2,sill:.9}));

  tool('add_stair','Add a straight stair that climbs to the level above (it cuts the floor there). Needs a level above and a floor under and over it.',
    {x:number('centre x'),z:number('centre z'),width:number('default 0.9'),length:number('run, default 3.6'),turns:{type:'integer',description:'direction it climbs: 0 south, 1 east, 2 north, 3 west'}},['x','z'],true,(env,args)=>{
      if(env.state.level>=Levels.count(env.state)-1)fail('there is no level above; call add_level first and come back to this level with switch_level');
      const std=Layout.STAIR,s={id:next(env,'st'),x:num(args,'x',{snapped:true}),z:num(args,'z',{snapped:true}),w:num(args,'width',{def:std.width,min:std.minWidth,max:std.maxWidth}),
        d:num(args,'length',{def:std.length,min:std.minLength,max:std.maxLength}),r:num(args,'turns',{def:0,min:0,max:3})};
      if(!Number.isInteger(s.r))fail('"turns" must be 0, 1, 2 or 3');
      layout(env).stairs.push(s);
      return describeStair(s);
    });

  function sizeFor(type,args){
    const L=pieceType(type),std=Catalog.stdOf(type),out={};
    const wantsSize=args.width!==undefined||args.depth!==undefined||args.size!==undefined;
    if(!wantsSize)return out;
    if(!std)fail(`${L.n} has a fixed size`);
    let w=L.w,d=L.d;
    if(args.size!==undefined){
      const found=std.sizes.find(([name])=>name.toLowerCase()===String(args.size).toLowerCase());
      if(!found)fail(`unknown size "${args.size}" for ${L.n}; valid: ${std.sizes.map(s=>s[0]).join(', ')}`);
      [,w,d]=found;
    }
    if(args.width!==undefined)w=num(args,'width',{min:std.w[0],max:std.w[1]});
    if(args.depth!==undefined)d=num(args,'depth',{min:std.d[0],max:std.d[1]});
    if(std.uniform){const k=scale(w/L.w);return{sx:k,sy:k,sz:k};}
    return{sx:scale(w/L.w),sz:scale(d/L.d)};
  }
  const sizeProps={width:number('optional, within the standard range of the piece'),depth:number('optional'),size:str('optional standard size name, see list_catalog')};
  function pushItem(env,type,x,z,turns,angle,extra){
    const L=pieceType(type);
    const it={id:next(env,'i'),t:type,x:round(x),z:round(z),r:turns,...extra};
    if(angle)it.a=round(((angle%90)+90)%90);
    if(L.elev!==undefined)it.y=L.elev;
    const rect=itemRect(it),homes=layout(env).floors.map(floorRect);
    if(!homes.some(f=>it.x>f.x0&&it.x<f.x1&&it.z>f.z0&&it.z<f.z1))fail(`${x},${z} is not on any floor; add a room or floor first`);
    env.state.items.push(it);
    return{...describeItem(it),fits:homes.some(f=>rect.x0>=f.x0-.01&&rect.x1<=f.x1+.01&&rect.z0>=f.z0-.01&&rect.z1<=f.z1+.01)};
  }

  tool('add_item','Place a piece (furniture, fixture, tree...) by its centre. See list_catalog for types.',
    {type:str('piece id from list_catalog'),x:number('centre x'),z:number('centre z'),turns:{type:'integer',description:'quarter turns 0-3, see the guide'},...sizeProps},['type','x','z'],true,(env,args)=>{
      const type=text(args,'type'),turns=num(args,'turns',{def:0,min:0,max:3});
      if(!Number.isInteger(turns))fail('"turns" must be 0, 1, 2 or 3');
      return pushItem(env,type,num(args,'x',{snapped:true}),num(args,'z',{snapped:true}),turns,0,sizeFor(type,args));
    });

  tool('place_against_wall','Place a piece with its back against a wall, turned correctly. wall_side says which wall: "north" means the wall is at the piece\'s north (smaller z).',
    {type:str('piece id'),wall_side:{type:'string',enum:['north','south','east','west'],description:'which wall the back touches'},wall_position:number('z of a north/south wall, x of an east/west wall (its centre line)'),along:number('position along the wall: x for north/south walls, z for east/west'),...sizeProps},
    ['type','wall_side','wall_position','along'],true,(env,args)=>{
      const type=text(args,'type'),side=choice(args,'wall_side',Object.keys(TURN_SIDES)),size=sizeFor(type,args),L=pieceType(type);
      const coord=num(args,'wall_position',{snapped:true}),along=num(args,'along',{snapped:true}),d=L.d*(size.sz||1);
      const horizontal=side==='north'||side==='south',walls=layout(env).walls.filter(w=>Layout.isH(w)===horizontal&&Math.abs(Layout.fixed(w)-coord)<.01&&along>=Layout.span(w)[0]-.01&&along<=Layout.span(w)[1]+.01);
      const half=walls.length?walls[0].t/2:HALF,gap=half+d/2,sign=side==='north'||side==='west'?1:-1;
      return pushItem(env,type,horizontal?along:coord+sign*gap,horizontal?coord+sign*gap:along,TURN_SIDES[side],0,size);
    });

  /* ---- editing ---- */
  function findElement(env,kind,id){
    const L=layout(env),lists={wall:L.walls,opening:L.openings,floor:L.floors,stair:L.stairs,item:env.state.items},rec=(lists[kind]||[]).find(x=>x.id===id);
    if(!rec)fail(`no ${kind} with id "${id}" on the open level; use list_elements`);
    return rec;
  }
  tool('delete_element','Delete a wall (with its doors and windows), opening, floor, stair or piece.',
    {kind:{type:'string',enum:KINDS},id:str('element id')},['kind','id'],true,(env,args)=>{
      const kind=choice(args,'kind',KINDS),id=text(args,'id',{max:40}),rec=findElement(env,kind,id),L=layout(env);
      if(kind==='wall'){L.walls=L.walls.filter(w=>w!==rec);L.openings=L.openings.filter(o=>o.wall!==rec.id);}
      else if(kind==='opening')L.openings=L.openings.filter(o=>o!==rec);
      else if(kind==='floor')L.floors=L.floors.filter(f=>f!==rec);
      else if(kind==='stair')L.stairs=L.stairs.filter(s=>s!==rec);
      else env.state.items=env.state.items.filter(i=>i!==rec);
      return{deleted:id};
    });

  tool('move_item','Move a piece to a new centre, snapped to 5 cm.',{id:str('piece id'),x:number('new x'),z:number('new z')},['id','x','z'],true,(env,args)=>{
    const it=findElement(env,'item',text(args,'id',{max:40}));
    it.x=num(args,'x',{snapped:true});it.z=num(args,'z',{snapped:true});
    return describeItem(it);
  });
  tool('rotate_item','Turn a piece: quarter turns, plus an optional free angle in degrees.',{id:str('piece id'),turns:{type:'integer'},angle:number('extra degrees, 0-89')},['id'],true,(env,args)=>{
    const it=findElement(env,'item',text(args,'id',{max:40}));
    if(args.turns!==undefined){it.r=num(args,'turns',{min:0,max:3});if(!Number.isInteger(it.r))fail('"turns" must be 0, 1, 2 or 3');}
    if(args.angle!==undefined){const a=num(args,'angle',{min:0,max:89});if(a)it.a=round(a);else delete it.a;}
    return describeItem(it);
  });
  tool('resize_item','Change a piece to a standard size, or to a width and depth inside its allowed range.',{id:str('piece id'),...sizeProps},['id'],true,(env,args)=>{
    const it=findElement(env,'item',text(args,'id',{max:40})),size=sizeFor(it.t,args);
    if(!Object.keys(size).length)fail('give a size, width or depth');
    for(const k of['sx','sy','sz'])delete it[k];
    for(const[k,v]of Object.entries(size))if(Math.abs(v-1)>.002)it[k]=v;
    return describeItem(it);
  });

  function finishSpec(args,key='finish'){
    const finish=choice(args,key,Catalog.WALL_FINISHES.map(f=>f[0]));
    const spec=FINISH_SPEC(finish),color=args.color;
    if(color!==undefined){if(!COLOR.test(String(color)))fail('"color" must look like #aabbcc');spec.c=String(color);}
    else if(finish!=='ladrillo'&&finish!=='madera')spec.c='#f1f0ec';
    return spec;
  }
  tool('set_wall_finish','Set the finish of one face of a wall. side "lo" is the north face of an east-west wall or the west face of a north-south one; "hi" is the other.',
    {wall_id:str('wall id'),side:{type:'string',enum:['lo','hi','both']},finish:{type:'string',enum:Catalog.WALL_FINISHES.map(f=>f[0])},color:str('#rrggbb')},['wall_id','side','finish'],true,(env,args)=>{
      const w=findElement(env,'wall',text(args,'wall_id',{max:40})),side=choice(args,'side',['lo','hi','both']),spec=finishSpec(args);
      for(const s of side==='both'?['lo','hi']:[side]){
        const face=w.faces&&w.faces[s];
        if(face)env.state.walls[face]={...spec};
      }
      return{wall:w.id,faces:w.faces};
    });
  tool('set_all_walls','Give every wall face of the open level, and the default for new walls, the same finish.',
    {finish:{type:'string',enum:Catalog.WALL_FINISHES.map(f=>f[0])},color:str('#rrggbb')},['finish'],true,(env,args)=>{
      const spec=finishSpec(args);
      env.state.wallBase={...spec};
      for(const w of layout(env).walls)for(const s of['lo','hi'])if(w.faces&&w.faces[s])env.state.walls[w.faces[s]]={...spec};
      return{walls:layout(env).walls.length};
    });
  tool('set_floor_finish','Change the finish of a floor, and optionally its name.',{floor_id:str('floor id'),finish:{type:'string',enum:Catalog.FLOORS.map(f=>f[0])},name:str('optional new name')},['floor_id','finish'],true,(env,args)=>{
    const f=findElement(env,'floor',text(args,'floor_id',{max:40}));
    f.f=choice(args,'finish',Catalog.FLOORS.map(x=>x[0]));
    if(args.name!==undefined)f.name=text(args,'name');
    return describeFloor(f);
  });
  tool('set_floor_ceiling','Change the finish of the ceiling over a floor: plain (liso), wood battens (madera) or exposed concrete (concreto).',{floor_id:str('floor id'),ceiling:{type:'string',enum:Catalog.CEILINGS.map(c=>c[0])}},['floor_id','ceiling'],true,(env,args)=>{
    const f=findElement(env,'floor',text(args,'floor_id',{max:40}));
    const ceiling=choice(args,'ceiling',Catalog.CEILINGS.map(c=>c[0]));
    if(ceiling==='liso')delete f.c;else f.c=ceiling;
    return{...describeFloor(f),ceiling};
  });

  /* ---- levels ---- */
  const levelIndex=(env,args)=>{
    if(args.index!==undefined){const i=num(args,'index',{min:0,max:Levels.count(env.state)-1});if(!Number.isInteger(i))fail('"index" must be an integer');return i;}
    if(args.name!==undefined){const i=env.state.levels.findIndex(l=>l.name.toLowerCase()===String(args.name).toLowerCase());if(i<0)fail(`no level named "${args.name}"`);return i;}
    fail('give the level "index" or "name"');
  };
  tool('add_level','Add a level above the top one (it becomes the open level). Returns its index.',{name:str('level name')},[],true,(env,args)=>{
    const i=Levels.add(env.state,p=>next(env,p));
    if(i<0)fail(`a plan holds at most ${Levels.MAX_LEVELS} levels`);
    if(args.name!==undefined)Levels.rename(env.state,i,String(args.name));
    Levels.switchTo(env.state,i);
    return{index:i,name:env.state.levels[i].name};
  });
  tool('switch_level','Open another level; every other tool works on the open level.',{index:{type:'integer'},name:str('level name')},[],true,(env,args)=>{
    const i=levelIndex(env,args);Levels.switchTo(env.state,i);
    return levelSummary(env,Levels.at(env.state,i));
  });
  tool('rename_level','Rename a level: give its index or current name, and the new name.',{index:{type:'integer'},name:str('current name'),new_name:str('new name')},['new_name'],true,(env,args)=>{
    const i=levelIndex(env,args);Levels.rename(env.state,i,text(args,'new_name'));
    return{index:i,name:env.state.levels[i].name};
  });
  tool('remove_level','Remove a level and its stairs. Destructive: ask the person first and pass confirm.',{index:{type:'integer'},name:str('level name'),confirm:bool('true to go ahead')},[],true,(env,args)=>{
    const i=levelIndex(env,args);
    if(args.confirm!==true)fail('this deletes the level and everything on it; ask the person and pass confirm: true');
    if(!Levels.remove(env.state,i))fail('the last level cannot be removed');
    return{levels:Levels.count(env.state)};
  });
  tool('copy_level_structure','Copy the walls and floors of another level into the open (empty) level, to repeat a storey.',{from:{type:'integer',description:'index of the level to copy'}},['from'],true,(env,args)=>{
    const from=num(args,'from',{min:0,max:Levels.count(env.state)-1});
    if(!Number.isInteger(from)||from===env.state.level)fail('"from" must be the index of another level');
    return{copied:Levels.copyStructure(env.state,from,p=>next(env,p))};
  });

  /* ---- layers ---- */
  tool('add_layer','Add a layer to the open level (for example electrical or plumbing).',{name:str('layer name'),color:str('#rrggbb')},['name'],true,(env,args)=>{
    const color=args.color===undefined?'#ff6b6b':String(args.color);
    if(!COLOR.test(color))fail('"color" must look like #aabbcc');
    const layer={id:next(env,'c'),name:text(args,'name'),color,visible:true,locked:false};
    layout(env).layers.push(layer);
    return layer;
  });
  tool('set_layer','Show, hide, lock, unlock or rename a layer of the open level.',{id:str('layer id from get_plan'),visible:bool(''),locked:bool(''),name:str('')},['id'],true,(env,args)=>{
    const layer=layout(env).layers.find(l=>l.id===args.id);
    if(!layer)fail(`no layer "${args.id}"; see get_plan`);
    if(args.visible!==undefined)layer.visible=args.visible===true;
    if(args.locked!==undefined)layer.locked=args.locked===true;
    if(args.name!==undefined&&!Layout.isBaseLayer(layer.id))layer.name=text(args,'name');
    return layer;
  });
  tool('assign_layer','Send an element to a layer of the open level.',{kind:{type:'string',enum:KINDS},id:str('element id'),layer:str('layer id')},['kind','id','layer'],true,(env,args)=>{
    const kind=choice(args,'kind',KINDS),rec=findElement(env,kind,text(args,'id',{max:40})),layer=layout(env).layers.find(l=>l.id===args.layer);
    if(!layer)fail(`no layer "${args.layer}"; see get_plan`);
    if(layer.id===Layout.BASE_OF[kind])delete rec.layer;else rec.layer=layer.id;
    return{id:rec.id,layer:layer.id};
  });
  tool('clear_level','Delete everything on the open level. Destructive: ask first and pass confirm.',{confirm:bool('true to go ahead')},[],true,(env,args)=>{
    if(args.confirm!==true)fail('this empties the open level; ask the person and pass confirm: true');
    const L=layout(env),layers=L.layers;
    Object.assign(L,{...Layout.empty(),layers,tag:L.tag});
    env.state.items=[];
    return{cleared:true};
  });

  /* ---------- running ---------- */
  const tools=T;
  const byName=new Map(T.map(t=>[t.name,t]));
  // a new empty plan, the same one the editor starts from
  function blank(){
    return Levels.ensure({style:'moderno',metal:'cromo',wood:'clara',walls:{},wallBase:{t:'pintura',c:'#f1f0ec'},n:0,defaults:{floor:'marmol_blanco'},
      layout:Layout.empty(),items:[],models:{},prices:{},currency:'$'});
  }
  // env = {state, blank?, example?}; returns {ok, result} or {ok:false, error}; env.state may be replaced
  function call(env,name,args={}){
    const t=byName.get(name);
    if(!t)return{ok:false,error:`unknown tool "${name}"`};
    if(!args||typeof args!=='object'||Array.isArray(args))return{ok:false,error:'the arguments must be an object'};
    env.blank=env.blank||blank;env.example=env.example||env.blank;
    try{return{ok:true,result:t.run(env,args)};}
    catch(e){
      if(e instanceof AgentError)return{ok:false,error:e.message};
      throw e;
    }
  }
  const definitions=()=>tools.map(({name,description,parameters})=>({name,description,parameters}));
  const mutates=name=>!!(byName.get(name)&&byName.get(name).mutates);

  return{GUIDE,tools,definitions,call,blank,mutates};
})();
if(typeof module!=='undefined')module.exports=Agent;
