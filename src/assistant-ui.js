/* The assistant's conversation view, shared by the editor panel and the pop-out window: formatted replies, grouped tool steps,
   live progress while the model works, and the actions on each message. It only draws; the page decides what the actions do. */
const AssistantUi=(()=>{
  const LABELS={
    get_plan:['Leyendo el plano','Leyó el plano'],list_elements:['Revisando los elementos','Revisó los elementos'],list_catalog:['Consultando el catálogo','Consultó el catálogo'],
    check_plan:['Revisando el plano','Revisó el plano'],get_quantities:['Calculando cantidades','Calculó cantidades'],list_templates:['Buscando plantillas','Buscó plantillas'],
    apply_template:['Aplicando una plantilla','Aplicó una plantilla'],add_wall:['Dibujando un muro','Dibujó un muro'],add_room:['Dibujando una habitación','Dibujó una habitación'],
    add_floor:['Colocando un piso','Colocó un piso'],add_door:['Colocando una puerta','Colocó una puerta'],add_window:['Colocando una ventana','Colocó una ventana'],
    add_stair:['Colocando una escalera','Colocó una escalera'],add_item:['Amueblando','Colocó un mueble'],place_against_wall:['Apoyando un mueble en un muro','Apoyó un mueble en un muro'],
    delete_element:['Eliminando un elemento','Eliminó un elemento'],move_item:['Moviendo un mueble','Movió un mueble'],rotate_item:['Girando un mueble','Giró un mueble'],
    resize_item:['Cambiando un tamaño','Cambió un tamaño'],set_wall_finish:['Cambiando un acabado','Cambió un acabado'],set_all_walls:['Pintando los muros','Pintó los muros'],
    set_floor_finish:['Cambiando un piso','Cambió un piso'],set_floor_ceiling:['Cambiando un cielo','Cambió un cielo'],add_level:['Añadiendo un nivel','Añadió un nivel'],
    switch_level:['Cambiando de nivel','Cambió de nivel'],rename_level:['Renombrando un nivel','Renombró un nivel'],remove_level:['Quitando un nivel','Quitó un nivel'],
    copy_level_structure:['Copiando un nivel','Copió un nivel'],add_layer:['Creando una capa','Creó una capa'],set_layer:['Ajustando una capa','Ajustó una capa'],
    assign_layer:['Asignando una capa','Asignó una capa'],clear_level:['Vaciando el nivel','Vació el nivel']
  };
  const esc=text=>Markdown.escape(text);
  const pretty=name=>String(name).replace(/_/g,' ');

  function stepLabel(name,done){const pair=LABELS[name];return pair?pair[done?1:0]:pretty(name);}
  function stepDetail(args){
    const entries=Object.entries(args||{}).filter(([,v])=>v!==undefined&&typeof v!=='object').slice(0,4);
    const text=entries.map(([k,v])=>`${k}: ${v}`).join(' · ');
    return text.length>80?text.slice(0,80)+'…':text;
  }
  function fmtElapsed(ms){
    const s=Math.max(0,Math.round(ms/1000));
    return s<60?`${s} s`:`${Math.floor(s/60)} min ${String(s%60).padStart(2,'0')} s`;
  }
  // consecutive tool steps become one block; everything else stays as it is
  function blocks(log){
    const out=[];
    log.forEach((entry,index)=>{
      const last=out[out.length-1];
      if(entry.kind==='step'){
        if(last&&last.type==='steps')last.steps.push(entry);else out.push({type:'steps',first:index,steps:[entry]});
      }else out.push({type:entry.kind,entry,index});
    });
    return out;
  }

  const toggled=new Map();
  const reset=()=>toggled.clear();

  function stepsHtml(block,running){
    const open=toggled.has(block.first)?toggled.get(block.first):running;
    const failed=block.steps.filter(s=>s.failed).length,n=block.steps.length;
    const title=running?`Trabajando · ${n} ${n===1?'paso':'pasos'}`:`${n} ${n===1?'paso':'pasos'}${failed?` · ${failed} con error`:''}`;
    return`<details class="aisteps" data-first="${block.first}"${open?' open':''}><summary>${esc(title)}</summary><ul>${block.steps.map(s=>{
      const state=s.failed?'fail':s.done?'ok':'run',detail=s.error||stepDetail(s.args);
      return`<li class="st ${state}"><span class="mark" aria-hidden="true"></span><b>${esc(stepLabel(s.name,s.done&&!s.failed))}</b>${detail?`<small>${esc(detail)}</small>`:''}</li>`;
    }).join('')}</ul></details>`;
  }

  function workHtml(status){
    const st=status||{},max=st.maxSteps||1,step=st.step||0,pct=Math.min(96,Math.max(6,Math.round((step/max)*100)));
    const text=st.phase==='tool'?`${stepLabel(st.tool&&st.tool.name,false)}…`:st.phase==='request'?'Esperando al modelo…':st.phase==='response'?'Leyendo la respuesta…':'Enviando el mensaje…';
    return`<div class="aiwork" role="status"><div class="row"><span class="spin" aria-hidden="true"></span><b>${esc(text)}</b><span class="el" data-elapsed="${st.startedAt||Date.now()}">${fmtElapsed(Date.now()-(st.startedAt||Date.now()))}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div><small>${step?`Paso ${step} de hasta ${max} por mensaje`:'Preparando la primera consulta'}</small></div>`;
  }

  const INTRO='<p class="note">Cuéntale qué quieres construir o cambiar. Trabaja con las mismas herramientas que tú: habitaciones, muros, puertas, escaleras, niveles, muebles en tamaños estándar y capas. Todo lo que haga se puede deshacer de una vez con Ctrl/Cmd+Z.</p>';

  function html(view){
    const log=view.log||[],list=blocks(log);
    const lastError=[...list].reverse().find(b=>b.type==='error'),lastDone=[...list].reverse().find(b=>b.type==='done');
    const body=list.map((b,i)=>{
      if(b.type==='user')return`<div class="aimsg user">${esc(b.entry.text)}</div>`;
      if(b.type==='assistant')return`<div class="aimsg assistant"><div class="md">${Markdown.render(b.entry.text)}</div><div class="aitools"><button type="button" data-act="copy" data-i="${b.index}">Copiar</button></div></div>`;
      if(b.type==='steps')return stepsHtml(b,view.busy&&i===list.length-1);
      if(b.type==='error')return`<div class="aimsg error">${esc(b.entry.text)}${!view.busy&&b===lastError&&i===list.length-1?'<div class="aitools"><button type="button" data-act="retry">Reintentar</button></div>':''}</div>`;
      if(b.type==='done'){
        const e=b.entry,facts=[e.stopped?'Detenido':'Listo',e.steps?`${e.steps} ${e.steps===1?'paso':'pasos'}`:'',e.ms?fmtElapsed(e.ms):''].filter(Boolean).join(' · ');
        const undo=e.changed&&!e.undone&&!view.busy&&b===lastDone&&i===list.length-1?'<button type="button" data-act="undo">↶ Deshacer lo que hizo</button>':e.undone?'<span class="undone">Deshecho</span>':'';
        return`<div class="aidone"><span>${e.stopped?'■':'✓'} ${esc(facts)}</span>${undo}</div>`;
      }
      return'';
    }).join('');
    return(log.length?body:INTRO)+(view.busy?workHtml(view.status):'');
  }

  function render(box,view,onAction){
    if(onAction)box._onAction=onAction;
    if(!box._bound){
      box._bound=true;
      box.addEventListener('click',e=>{
        const b=e.target.closest('button[data-act]');if(!b)return;
        const act=b.dataset.act,index=+b.dataset.i;
        if(act==='copy'){
          const entry=box._view.log[index];
          Promise.resolve(navigator.clipboard&&navigator.clipboard.writeText(entry?entry.text:'')).then(()=>{b.textContent='Copiado';setTimeout(()=>{b.textContent='Copiar';},1400);}).catch(()=>{});
          return;
        }
        if(box._onAction)box._onAction(act);
      });
      box.addEventListener('click',e=>{const summary=e.target.closest('details.aisteps > summary');if(summary){const d=summary.parentNode;toggled.set(+d.dataset.first,!d.open);}});
    }
    box._view=view;
    const stick=box.scrollHeight-box.scrollTop-box.clientHeight<90;
    box.innerHTML=html(view);
    if(stick)box.scrollTop=box.scrollHeight;
  }

  // keeps the elapsed time moving between model events
  function tick(root){
    root.querySelectorAll('[data-elapsed]').forEach(el=>{el.textContent=fmtElapsed(Date.now()-(+el.dataset.elapsed));});
  }

  return{render,tick,reset,blocks,html,stepLabel,stepDetail,fmtElapsed};
})();
if(typeof module!=='undefined')module.exports=AssistantUi;
