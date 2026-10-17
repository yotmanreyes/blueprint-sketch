/* Bill of quantities and budget of a plan: areas per room, net wall surface per finish,
   floors per finish, openings and furniture. Prices are unit prices typed by the user. */
const Quantities=(()=>{
  const WALL_HEIGHT=2.4,FINISH_LABELS={pintura:'Pintura',micro:'Microcemento',ladrillo:'Ladrillo','enchape-grande':'Enchape 60×120','enchape-metro':'Enchape metro',madera:'Listones de madera'};
  const round=(n,d=2)=>+n.toFixed(d);

  const finishKey=spec=>spec.t==='enchape'?`enchape-${spec.p||'grande'}`:spec.t;

  // net area of a wall face: its length times the height, minus the openings that cut through it
  function faceArea(L,w,side,height){
    const lo=side==='lo',[s0,s1]=Layout.span(w),A=Layout.endInfo(L,w,'a'),Z=Layout.endInfo(L,w,'b');
    const a0=s0+(lo?A.trimLo:A.trimHi),a1=s1-(lo?Z.trimLo:Z.trimHi);
    if(a1<=a0)return{length:0,area:0};
    let area=(a1-a0)*height;
    for(const o of Layout.opsOf(L,w)){
      const width=Math.min(o.b,a1)-Math.max(o.a,a0);
      if(width>0)area-=width*(Math.min(o.y1,height)-o.y0);
    }
    return{length:a1-a0,area:Math.max(0,area)};
  }

  function compute(state,{lib={},floorNames={},height=WALL_HEIGHT}={}){
    const spec=id=>state.walls[id]||state.wallBase,levels=Levels.list(state),many=levels.length>1;
    const rooms=[],walls=[],finishArea={},floorArea={},openings={door:{},window:{}},furniture={},stairs={};
    let structureArea=0,structureLength=0,slabArea=0,doors=0,windows=0;

    for(const lv of levels){
      const L=lv.layout;
      for(const f of L.floors)rooms.push({id:f.id,name:many?`${lv.name} · ${f.name||'Piso'}`:f.name||'Piso',area:round(f.w*f.d),perimeter:round(2*(f.w+f.d))});
      for(const w of L.walls){
        const[s0,s1]=Layout.span(w),length=s1-s0;
        let area=length*height;
        for(const o of Layout.opsOf(L,w))area-=(o.b-o.a)*(Math.min(o.y1,height)-o.y0);
        area=Math.max(0,area);
        walls.push({id:w.id,length:round(length),thickness:w.t,area:round(area)});
        structureArea+=area;structureLength+=length;
        for(const side of['lo','hi']){
          const id=w.faces&&w.faces[side];if(!id)continue;
          const key=finishKey(spec(id));
          finishArea[key]=(finishArea[key]||0)+faceArea(L,w,side,height).area;
        }
      }
      for(const f of L.floors){
        floorArea[f.f]=(floorArea[f.f]||0)+f.w*f.d;
        if(lv.index>0)slabArea+=f.w*f.d;
      }
      if(lv.index>0)for(const s of Levels.arriving(state,lv.index)){const r=Layout.stairRect(s);slabArea-=(r.x1-r.x0)*(r.z1-r.z0);}
      for(const o of L.openings){const k=`${round(o.w)}x${round(o.h)}`;openings[o.kind][k]=(openings[o.kind][k]||0)+1;if(o.kind==='door')doors++;else windows++;}
      for(const it of lv.items)if(lib[it.t])furniture[it.t]=(furniture[it.t]||0)+1;
      for(const s of L.stairs){const k=`${round(s.w)}x${round(s.d)}`;stairs[k]=(stairs[k]||0)+1;}
    }

    const lines=[];
    const line=(section,key,label,qty,unit)=>lines.push({section,key,label,qty:round(qty),unit,price:state.prices&&state.prices[key]||0});
    line('Estructura','wall','Muros construidos (una cara, descontando vanos)',structureArea,'m²');
    if(slabArea>0)line('Estructura','slab','Losa de entrepiso (descontando huecos de escalera)',slabArea,'m²');
    for(const[k,v]of Object.entries(finishArea).sort())line('Acabados de pared',`finish:${k}`,FINISH_LABELS[k]||k,v,'m²');
    for(const[k,v]of Object.entries(floorArea).sort())line('Pisos',`floor:${k}`,floorNames[k]||k,v,'m²');
    for(const kind of['door','window'])for(const[size,count]of Object.entries(openings[kind]).sort())
      line('Puertas y ventanas',`${kind}:${size}`,`${kind==='door'?'Puerta':'Ventana'} ${size.replace('x',' × ')} m`,count,'u');
    for(const[size,count]of Object.entries(stairs).sort())line('Escaleras',`stair:${size}`,`Escalera ${size.replace('x',' × ')} m`,count,'u');
    for(const[type,count]of Object.entries(furniture).sort())line('Mobiliario',`item:${type}`,lib[type].n,count,'u');
    for(const l of lines)l.total=round(l.qty*l.price);

    const subtotal=round(lines.reduce((s,l)=>s+l.total,0)),contingencyPercent=state.prices&&state.prices.contingency||0;
    const contingency=round(subtotal*contingencyPercent/100);
    return{
      rooms,walls,lines,
      summary:{floorArea:round(rooms.reduce((s,r)=>s+r.area,0)),wallLength:round(structureLength),wallArea:round(structureArea),doors,windows},
      budget:{subtotal,contingencyPercent,contingency,total:round(subtotal+contingency)}
    };
  }

  const num=n=>String(n).replace('.',',');
  // semicolon separated with decimal commas and a BOM, so Excel in Spanish opens it correctly
  function csv(q,{name='Plano',currency='$'}={}){
    const row=cells=>cells.map(c=>/[;"\n]/.test(String(c))?`"${String(c).replace(/"/g,'""')}"`:c).join(';');
    const out=[row([`Cantidades y presupuesto · ${name}`]),'',row(['Habitación','Área (m²)','Perímetro (m)']),
      ...q.rooms.map(r=>row([r.name,num(r.area),num(r.perimeter)])),'',
      row(['Concepto','Cantidad','Unidad',`Precio unitario (${currency})`,`Subtotal (${currency})`])];
    let section='';
    for(const l of q.lines){
      if(l.section!==section){section=l.section;out.push(row([section]));}
      out.push(row([l.label,num(l.qty),l.unit,num(l.price),num(l.total)]));
    }
    out.push('',row(['Subtotal','','','',num(q.budget.subtotal)]),row([`Imprevistos (${num(q.budget.contingencyPercent)} %)`,'','','',num(q.budget.contingency)]),row(['Total','','','',num(q.budget.total)]));
    return'﻿'+out.join('\r\n')+'\r\n';
  }

  return{compute,csv,finishKey,FINISH_LABELS};
})();
if(typeof module!=='undefined')module.exports=Quantities;
