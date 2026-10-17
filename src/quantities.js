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
    const L=state.layout,spec=id=>state.walls[id]||state.wallBase;
    const rooms=L.floors.map(f=>({id:f.id,name:f.name||'Piso',area:round(f.w*f.d),perimeter:round(2*(f.w+f.d))}));

    const walls=[],finishArea={};
    let structureArea=0,structureLength=0;
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

    const floorArea={};
    for(const f of L.floors)floorArea[f.f]=(floorArea[f.f]||0)+f.w*f.d;

    const openings={door:{},window:{}};
    for(const o of L.openings){const k=`${round(o.w)}x${round(o.h)}`;openings[o.kind][k]=(openings[o.kind][k]||0)+1;}

    const furniture={};
    for(const it of state.items)if(lib[it.t])furniture[it.t]=(furniture[it.t]||0)+1;

    const lines=[];
    const line=(section,key,label,qty,unit)=>lines.push({section,key,label,qty:round(qty),unit,price:state.prices&&state.prices[key]||0});
    line('Estructura','wall','Muros construidos (una cara, descontando vanos)',structureArea,'m²');
    for(const[k,v]of Object.entries(finishArea).sort())line('Acabados de pared',`finish:${k}`,FINISH_LABELS[k]||k,v,'m²');
    for(const[k,v]of Object.entries(floorArea).sort())line('Pisos',`floor:${k}`,floorNames[k]||k,v,'m²');
    for(const kind of['door','window'])for(const[size,count]of Object.entries(openings[kind]).sort())
      line('Puertas y ventanas',`${kind}:${size}`,`${kind==='door'?'Puerta':'Ventana'} ${size.replace('x',' × ')} m`,count,'u');
    for(const[type,count]of Object.entries(furniture).sort())line('Mobiliario',`item:${type}`,lib[type].n,count,'u');
    for(const l of lines)l.total=round(l.qty*l.price);

    const subtotal=round(lines.reduce((s,l)=>s+l.total,0)),contingencyPercent=state.prices&&state.prices.contingency||0;
    const contingency=round(subtotal*contingencyPercent/100);
    return{
      rooms,walls,lines,
      summary:{floorArea:round(rooms.reduce((s,r)=>s+r.area,0)),wallLength:round(structureLength),wallArea:round(structureArea),
        doors:L.openings.filter(o=>o.kind==='door').length,windows:L.openings.filter(o=>o.kind==='window').length},
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
