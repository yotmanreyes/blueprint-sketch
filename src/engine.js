/* Remodeling engine: every scene element is an entity of a registered kind and is
   selected, moved, sculpted and edited through the same pipeline.
   Modes: navigate (camera only, nothing reacts), build (select, move, draw with tools),
   sculpt (select and reshape through handles). */
const Engine=(()=>{
  const CLICK_TOLERANCE_PX=5,HANDLE_SCREEN_SIZE=.009,HIT_TOLERANCE=.3,WHEEL_STEP_PX=40,WHEEL_STEP_DEG=15,WHEEL_COMMIT_MS=300;

  function create({host,dom,scene,camera,controls,roots,on={}}){
    const kinds={},ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),hit=new THREE.Vector3();
    const floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
    const helper=new THREE.BoxHelper(undefined,0xd08a3c);helper.visible=false;scene.add(helper);
    const handlesG=new THREE.Group();scene.add(handlesG);
    const handleMat=new THREE.MeshBasicMaterial({color:0xd08a3c,depthTest:false,transparent:true,toneMapped:false});
    const rotMat=new THREE.MeshBasicMaterial({color:0x4fc3f7,depthTest:false,transparent:true,toneMapped:false});
    const rotKnob=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),rotMat);rotKnob.renderOrder=21;rotKnob.visible=false;
    const rotLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),
      new THREE.LineBasicMaterial({color:0x4fc3f7,depthTest:false,transparent:true,opacity:.7,toneMapped:false}));
    rotLine.renderOrder=20;rotLine.visible=false;rotLine.frustumCulled=false;scene.add(rotKnob,rotLine);
    let sel=null,drag=null,down=null,mode='build',tool=null,wheelAcc=0,wheelTimer=null;

    const define=(name,def)=>{kinds[name]=def;};
    const tag=(obj,kind,id)=>{obj.userData.entity={kind,id};return obj;};
    const entityOf=obj=>{for(let o=obj;o;o=o.parent)if(o.userData.entity)return o.userData.entity;return null;};
    const recordOf=s=>s&&kinds[s.kind].get(s.id);
    const emit=(name,...a)=>on[name]&&on[name](...a);
    const planeAt=y=>new THREE.Plane(new THREE.Vector3(0,1,0),-y);

    function setNdc(e){
      const r=dom.getBoundingClientRect();
      ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
      ray.setFromCamera(ndc,camera);
    }
    // among the hits just behind the nearest one, a kind with higher priority wins (an opening sits inside its wall)
    function rayHit(filter=()=>true){
      let best=null,nearest=null;
      for(const h of ray.intersectObjects(roots(),true)){
        const ent=entityOf(h.object);if(!ent||!filter(ent))continue;
        if(nearest===null)nearest=h.distance;else if(h.distance>nearest+HIT_TOLERANCE)break;
        const priority=kinds[ent.kind].priority||0;
        if(!best||priority>best.priority)best={entity:ent,point:h.point,priority};
      }
      return best&&{entity:best.entity,point:best.point};
    }
    const pick=e=>{setNdc(e);const h=rayHit();return h&&h.entity;};
    const groundPoint=plane=>ray.ray.intersectPlane(plane,hit)?hit.clone():null;

    function select(kind,id){
      sel=kind&&kinds[kind].get(id)?{kind,id}:null;
      refresh();
    }
    function refresh(){
      if(sel&&!(recordOf(sel)&&kinds[sel.kind].object(sel.id)))sel=null;
      update();
      emit('select',sel);
    }

    function syncHandles(){
      const def=sel&&kinds[sel.kind],rec=def&&recordOf(sel);
      const pts=mode==='sculpt'&&rec&&def.handles?def.handles(rec):[];
      while(handlesG.children.length<pts.length){
        const m=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),handleMat);
        m.renderOrder=20;m.userData.handle=handlesG.children.length;handlesG.add(m);
      }
      handlesG.children.forEach((m,i)=>{
        m.visible=i<pts.length;
        if(!m.visible)return;
        m.position.set(pts[i].x,pts[i].y,pts[i].z);
        m.scale.setScalar(camera.position.distanceTo(m.position)*HANDLE_SCREEN_SIZE);
      });
    }
    function syncRotator(){
      const def=sel&&kinds[sel.kind],rec=def&&recordOf(sel),on=!!rec&&!!def.rotator&&mode!=='navigate'&&!tool;
      rotKnob.visible=rotLine.visible=on;
      if(!on)return;
      const k=def.rotator(rec),c=def.pivot(rec),a=rotLine.geometry.attributes.position;
      rotKnob.position.set(k.x,k.y,k.z);
      rotKnob.scale.setScalar(camera.position.distanceTo(rotKnob.position)*HANDLE_SCREEN_SIZE*1.1);
      a.setXYZ(0,c.x,k.y,c.z);a.setXYZ(1,k.x,k.y,k.z);a.needsUpdate=true;
    }
    function update(){
      const o=sel&&kinds[sel.kind].object(sel.id);
      helper.visible=!!o&&mode!=='navigate';
      if(helper.visible)helper.setFromObject(o);
      syncHandles();syncRotator();
    }

    function act(action){
      if(!sel||mode==='navigate')return;
      const def=kinds[sel.kind],result=def.act(recordOf(sel),action)||{};
      if(result.rebuild&&def.rebuild)def.rebuild();
      changed(result.select?{kind:sel.kind,id:result.select}:null);
    }
    // called after any structural change: persists, optionally selects, refreshes
    function changed(selectSpec){
      if(selectSpec)sel={kind:selectSpec.kind,id:selectSpec.id};
      emit('commit',sel);
      refresh();
    }

    function setMode(m){
      mode=m;
      if(m==='navigate'){sel=null;setTool(null);}
      if(m==='sculpt')setTool(null);
      dom.style.cursor=m==='navigate'?'grab':'';
      refresh();
      emit('mode',m);
    }
    function setTool(t){
      if(tool&&tool.end)tool.end();
      tool=t;
      if(t){sel=null;refresh();}
      dom.style.cursor=t?'crosshair':mode==='navigate'?'grab':'';
      emit('tool',t);
    }

    function startDrag(info,e){
      drag={...info,moved:false};
      controls.enabled=false;
      dom.setPointerCapture(e.pointerId);
    }

    host.addEventListener('pointerdown',e=>{
      if(e.target!==dom)return;
      down={x:e.clientX,y:e.clientY};
      if(mode==='navigate')return;
      setNdc(e);
      if(tool){
        const p=groundPoint(floorPlane);
        if(p){startDrag({tool:true},e);tool.down(p,e,api);}
        return;
      }
      if(sel&&rotKnob.visible&&ray.intersectObject(rotKnob,false).length){
        startDrag({...sel,rotate:true,plane:planeAt(rotKnob.position.y)},e);
        return;
      }
      if(mode==='sculpt'&&sel){
        const h=ray.intersectObjects(handlesG.children,false).find(x=>x.object.visible);
        if(h){
          const def=kinds[sel.kind],rec=recordOf(sel),pt=def.handles(rec)[h.object.userData.handle];
          startDrag({...sel,handle:h.object.userData.handle,plane:planeAt(pt.y)},e);
          return;
        }
      }
      const ent=pick(e);
      if(!ent)return;
      const def=kinds[ent.kind];
      if(def.draggable===false||mode!=='build'){pending=ent;return;}
      select(ent.kind,ent.id);
      const rec=recordOf(ent),plane=def.plane?def.plane(rec):floorPlane;
      const p=groundPoint(plane);
      if(p)startDrag({...ent,plane,offset:def.grab(rec,p)},e);
    },true);
    let pending=null;

    host.addEventListener('pointermove',e=>{
      setNdc(e);
      if(!drag){if(tool&&tool.hover&&mode==='build'&&e.target===dom){const p=groundPoint(floorPlane);if(p)tool.hover(p,e,api);}return;}
      if(drag.tool){const p=groundPoint(floorPlane);if(p)tool.move(p,e,api);return;}
      const p=groundPoint(drag.plane);
      if(!p)return;
      const def=kinds[drag.kind],rec=recordOf(drag);
      if(drag.rotate){const c=def.pivot(rec);def.rotateTo(rec,Math.atan2(p.x-c.x,p.z-c.z),e.altKey);}
      else if(drag.handle!==undefined)def.dragHandle(rec,drag.handle,p);
      else def.drag(rec,p,drag.offset);
      def.live(rec);
      drag.moved=true;
      update();
      emit('move',drag);
    });

    host.addEventListener('pointerup',e=>{
      const wasTap=down&&e.target===dom&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<=CLICK_TOLERANCE_PX;
      if(drag){
        const d=drag;drag=null;controls.enabled=true;
        if(d.tool){setNdc(e);const p=groundPoint(floorPlane);tool.up(p,e,api);return;}
        if(d.moved)emit('commit',sel);
        refresh();
        return;
      }
      const ent=pending;pending=null;
      if(!wasTap)return;
      if(ent&&mode!=='navigate'){select(ent.kind,ent.id);return;}
      setNdc(e);
      emit('empty',ray);
      if(mode!=='navigate')select(null);
    });

    addEventListener('keydown',e=>{
      if(!sel||mode!=='build'||/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))return;
      const name=e.shiftKey&&e.key.startsWith('Arrow')?'Shift+'+e.key:e.key;
      const action=(kinds[sel.kind].keys||{})[name];
      if(action){e.preventDefault();act(action);}
    });

    function rotateSelected(deg){
      const def=kinds[sel.kind],rec=recordOf(sel);
      def.rotateBy(rec,deg);def.live(rec);update();emit('move',sel);
      clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{emit('commit',sel);refresh();},WHEEL_COMMIT_MS);
    }
    const canRotate=()=>sel&&mode!=='navigate'&&kinds[sel.kind].rotateBy;
    host.addEventListener('wheel',e=>{
      if(!(e.altKey||e.shiftKey)||!canRotate())return;
      e.preventDefault();e.stopPropagation();
      wheelAcc+=e.deltaY||e.deltaX;
      while(Math.abs(wheelAcc)>=WHEEL_STEP_PX){rotateSelected(Math.sign(wheelAcc)*WHEEL_STEP_DEG);wheelAcc-=Math.sign(wheelAcc)*WHEEL_STEP_PX;}
    },{capture:true,passive:false});
    // Safari reports the trackpad two-finger twist as a gesture
    let lastGesture=0;
    host.addEventListener('gesturestart',e=>{lastGesture=0;if(canRotate())e.preventDefault();});
    host.addEventListener('gesturechange',e=>{
      if(!canRotate())return;
      e.preventDefault();rotateSelected(e.rotation-lastGesture);lastGesture=e.rotation;
    });

    const api={define,tag,select,refresh,update,act,changed,setMode,setTool,rayHit,
      get selected(){return sel;},
      get selectedRecord(){return recordOf(sel);},
      get mode(){return mode;},
      get tool(){return tool;},
      kind:name=>kinds[name]};
    return api;
  }

  return {create};
})();
