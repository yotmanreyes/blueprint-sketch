/* Turns a plan into 2D drawing primitives in metres (x right, z down), the common input
   for the PDF and DXF exporters. Layers: WALLS, OPENINGS, STAIRS, FURNITURE, ROOMS, DIMENSIONS. */
const Drawing=(()=>{
  const EPS=1e-6,TICK=.08,DIM_GAP=.5,DIM_STEP=.45,TEXT_MM={room:2.8,area:2.2,item:1.6,dim:2.2};
  const comma=n=>n.toFixed(2).replace('.',',');
  const itemAngle=it=>it.r*90+(it.a||0);

  function wallRect(ax,c,t,a,b){
    return ax==='x'?[[a,c-t/2],[b,c-t/2],[b,c+t/2],[a,c+t/2]]:[[c-t/2,a],[c+t/2,a],[c+t/2,b],[c-t/2,b]];
  }
  function itemPolygon(it,w,d){
    const t=itemAngle(it)*Math.PI/180,cos=Math.cos(t),sin=Math.sin(t);
    return[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([lx,lz])=>[it.x+lx*cos+lz*sin,it.z-lx*sin+lz*cos]);
  }

  const CLIMB=[[0,1],[1,0],[0,-1],[-1,0]],ARROW_HEAD=.15;
  // outline, one line per step and an arrow; on the level above the arrow points back down
  function stairPrims(s,prims,text,label,climbs=true){
    const r=Layout.stairRect(s),[dx,dz]=CLIMB[s.r],sign=climbs?1:-1,across=[Math.abs(dz),Math.abs(dx)];
    const line=(x1,z1,x2,z2)=>prims.push({t:'line',x1,z1,x2,z2,layer:'STAIRS'});
    prims.push({t:'poly',closed:true,layer:'STAIRS',fill:null,pts:[[r.x0,r.z0],[r.x1,r.z0],[r.x1,r.z1],[r.x0,r.z1]]});
    const steps=Layout.stairSteps(Levels.PITCH),tread=s.d/steps,half=s.w/2;
    for(let k=1;k<steps;k++){
      const x=s.x+dx*(k*tread-s.d/2),z=s.z+dz*(k*tread-s.d/2);
      line(x-across[0]*half,z-across[1]*half,x+across[0]*half,z+across[1]*half);
    }
    const reach=s.d*.35,tip=[s.x+sign*dx*reach,s.z+sign*dz*reach];
    line(s.x-sign*dx*reach,s.z-sign*dz*reach,tip[0],tip[1]);
    for(const side of[-1,1])line(tip[0],tip[1],tip[0]-sign*dx*ARROW_HEAD+side*across[0]*ARROW_HEAD*.6,tip[1]-sign*dz*ARROW_HEAD+side*across[1]*ARROW_HEAD*.6);
    text(s.x+across[0]*(half+.2),s.z+across[1]*(half+.2),label,TEXT_MM.item,'STAIRS');
  }

  function build(state,lib,level=state.level){
    const lv=Levels.at(state,level),L=lv.layout,prims=[],items=lv.items;
    const line=(x1,z1,x2,z2,layer)=>prims.push({t:'line',x1,z1,x2,z2,layer});
    const text=(x,z,value,mm,layer,bold=false)=>prims.push({t:'text',x,z,text:value,mm,layer,bold});

    for(const w of L.walls){
      const ax=Layout.axisOf(w),c=Layout.fixed(w),[s0,s1]=Layout.span(w);
      const a0=s0-Layout.endInfo(L,w,'a').ext,a1=s1+Layout.endInfo(L,w,'b').ext;
      const gaps=Layout.opsOf(L,w).sort((p,q)=>p.a-q.a);
      let at=a0;
      const pieces=[];
      for(const g of gaps){if(g.a>at+EPS)pieces.push([at,g.a]);at=Math.max(at,g.b);}
      if(a1>at+EPS)pieces.push([at,a1]);
      for(const[p,q]of pieces)prims.push({t:'poly',closed:true,layer:'WALLS',fill:'wall',pts:wallRect(ax,c,w.t,p,q)});
    }

    for(const o of L.openings){
      const w=Layout.wallById(L,o.wall);if(!w)continue;
      const h=Layout.isH(w),c=Layout.fixed(w),a=Layout.span(w)[0]+o.pos,b=a+o.w,half=w.t/2;
      const at=(along,across)=>h?[along,c+across]:[c+across,along];
      const seg=(p,q,layer='OPENINGS')=>line(...at(...[p[0],p[1]]),...at(q[0],q[1]),layer);
      seg([a,-half],[a,half]);seg([b,-half],[b,half]);
      if(o.kind==='window'){for(const k of[-half,0,half])seg([a,k],[b,k]);continue;}
      const[hx,hz]=at(a,0),leaf=h?[hx,hz+o.w]:[hx+o.w,hz];
      line(hx,hz,leaf[0],leaf[1],'OPENINGS');
      prims.push({t:'arc',cx:hx,cz:hz,r:o.w,a0:0,a1:90,layer:'OPENINGS'});
    }

    for(const it of items){
      const def=lib[it.t];if(!def)continue;
      const w=def.w*(it.sx||1),d=def.d*(it.sz||1);
      prims.push({t:'poly',closed:true,layer:'FURNITURE',fill:null,pts:itemPolygon(it,w,d)});
      if(Math.min(w,d)>.25)text(it.x,it.z,def.n,TEXT_MM.item,'FURNITURE');
    }

    for(const s of L.stairs||[])stairPrims(s,prims,text,'SUBE');
    for(const s of Levels.arriving(state,level))stairPrims(s,prims,text,'BAJA',false);

    for(const f of L.floors){
      if(f.name)text(f.x,f.z-.15,f.name.toUpperCase(),TEXT_MM.room,'ROOMS',true);
      text(f.x,f.z+.2,`${comma(f.w*f.d)} m²`,TEXT_MM.area,'ROOMS');
    }

    dimensions(L,line,text);
    return prims;
  }

  // dimension chains above and to the left of the plan, plus the overall width and window sizes
  function dimensions(L,line,text){
    const F=Layout.frame(L);if(!F)return;
    const dim=(ax,at,a,b)=>{
      const h=ax==='x',label=comma(b-a);
      if(h){line(a,at,b,at,'DIMENSIONS');line(a,at-TICK,a,at+TICK,'DIMENSIONS');line(b,at-TICK,b,at+TICK,'DIMENSIONS');text((a+b)/2,at-.14,label,TEXT_MM.dim,'DIMENSIONS');}
      else{line(at,a,at,b,'DIMENSIONS');line(at-TICK,a,at+TICK,a,'DIMENSIONS');line(at-TICK,b,at+TICK,b,'DIMENSIONS');text(at-.3,(a+b)/2,label,TEXT_MM.dim,'DIMENSIONS');}
    };
    const chain=(ax,at,pts)=>{for(let i=0;i<pts.length-1;i++)dim(ax,at,pts[i],pts[i+1]);};
    const xs=Layout.splits(L,'x'),zs=Layout.splits(L,'z');
    chain('x',F.z0-DIM_GAP,xs);chain('z',F.x0-DIM_GAP-.1,zs);
    if(xs.length>2)dim('x',F.z0-DIM_GAP-DIM_STEP,F.x0,F.x1);
    if(zs.length>2)dim('z',F.x0-DIM_GAP-DIM_STEP-.1,F.z0,F.z1);
    dim('x',F.z1+DIM_GAP,F.x0,F.x1);
  }

  function bounds(prims){
    let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
    const take=(x,z)=>{x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);};
    for(const p of prims){
      if(p.t==='line'){take(p.x1,p.z1);take(p.x2,p.z2);}
      else if(p.t==='poly')p.pts.forEach(([x,z])=>take(x,z));
      else if(p.t==='arc'){take(p.cx,p.cz);take(p.cx+p.r,p.cz+p.r);}
      else if(p.t==='text'){const half=p.text.length*.09;take(p.x-half,p.z);take(p.x+half,p.z);}
    }
    return x0===Infinity?null:{x0,x1,z0,z1};
  }

  return{build,bounds,comma,itemAngle};
})();
if(typeof module!=='undefined')module.exports=Drawing;
