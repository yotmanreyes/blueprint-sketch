/* Ready-made plans to start from: houses, buildings, a park. Each builder draws with the same walls,
   floors, openings, stairs and pieces a person would, so the result is an ordinary plan. */
const Templates=(()=>{
  const WALL=.15,HALF=WALL/2;
  const SIDES={n:{r:0},w:{r:1},s:{r:2},e:{r:3}};

  // every call is in the plan's own coordinates; `mirror` flips the x axis around a vertical line for twin apartments
  function context(state,lib){
    let mirror=null,zmirror=null,dx=0,dz=0;
    const next=prefix=>prefix+(++state.n);
    const fx=x=>(mirror===null?x:mirror-x)+dx,fz=z=>(zmirror===null?z:zmirror-z)+dz;
    // a turned piece keeps facing the same way in the drawing it was written for
    const turn=r=>{if(mirror!==null&&r%2)r=(r+2)%4;if(zmirror!==null&&r%2===0)r=(r+2)%4;return r;};
    const L=()=>state.layout;
    const place=(kind,x,z,w,h,sill,width)=>{
      const near=Layout.nearestWall(L(),fx(x),fz(z),.4);
      if(!near)throw new Error(`no wall for the ${kind} at ${x},${z}`);
      const o={id:next('o'),wall:near.wall.id,pos:0,w:width||w,h,sill,kind};
      o.pos=near.at-o.w/2;
      if(!Layout.fitOpening(L(),o,Levels.WALL_HEIGHT)||Layout.overlaps(L(),o))throw new Error(`the ${kind} at ${x},${z} does not fit`);
      L().openings.push(o);
    };
    const api={
      mirrored(about,build){mirror=about;try{build();}finally{mirror=null;}},
      flipped(about,build){zmirror=about;try{build();}finally{zmirror=null;}},
      moved(x,z,build){dx=x;dz=z;try{build();}finally{dx=0;dz=0;}},
      wall(x1,z1,x2,z2,t=WALL){
        const id=next('w');
        L().walls.push(Layout.normalize({id,x1:fx(x1),z1:fz(z1),x2:fx(x2),z2:fz(z2),t,faces:{lo:id+'a',hi:id+'b'}}));
      },
      perimeter(x0,z0,x1,z1){api.wall(x0,z0,x1,z0);api.wall(x0,z1,x1,z1);api.wall(x0,z0,x0,z1);api.wall(x1,z0,x1,z1);},
      floor(x0,z0,x1,z1,name,f='marmol_blanco'){
        const a=fx(x0),b=fx(x1),lo=Math.min(a,b),hi=Math.max(a,b);
        L().floors.push({id:next('f'),x:(lo+hi)/2,z:fz((z0+z1)/2),w:hi-lo,d:z1-z0,f,name,zone:''});
      },
      door(x,z,{w=.9,h=2.1}={}){place('door',x,z,w,h,0,w);},
      window(x,z,{w=1.2,h=1.2,sill=.9}={}){place('window',x,z,w,h,sill,w);},
      stair(x,z,w,d,r){L().stairs.push({id:next('st'),x:fx(x),z:fz(z),w,d,r:turn(r)});},
      item(t,x,z,r=0){
        if(!lib[t])throw new Error('unknown piece '+t);
        state.items.push({id:next('i'),t,x:fx(x),z:fz(z),r:turn(r)});
      },
      // a piece with its back to the inner face of a wall; `along` runs on x for n and s walls and on z for w and e
      against(t,side,coord,along){
        const d=lib[t].d,{r}=SIDES[side],at=dist=>dist+d/2+HALF;
        if(side==='n')api.item(t,along,coord+at(0),r);
        else if(side==='s')api.item(t,along,coord-at(0),r);
        else if(side==='w')api.item(t,coord+at(0),along,r);
        else api.item(t,coord-at(0),along,r);
      },
      level(name){
        const i=Levels.add(state,next);
        Levels.switchTo(state,i);
        state.levels[state.level].name=name;
      },
      rename(name){state.levels[state.level].name=name;},
      walls(spec){state.wallBase={...spec};}
    };
    return api;
  }

  /* ---------- builders ---------- */
  function studio(T){
    T.perimeter(0,0,7,5);T.wall(4.6,0,4.6,2.2);T.wall(4.6,2.2,7,2.2);
    T.floor(0,0,4.6,5,'Dormitorio y sala','madera');T.floor(4.6,0,7,2.2,'Baño','gris_claro');T.floor(4.6,2.2,7,5,'Cocina','gris_claro');
    T.door(1.2,5);T.door(5.8,2.2,{w:.8});
    T.window(0,2.5,{w:1.4});T.window(2.3,0);T.window(7,3.0,{w:1.0});T.window(3.0,5,{w:1.2});
    T.against('cama140','n',0,1.4);T.against('mesanoche','n',0,.4);T.against('mesanoche','n',0,2.4);T.against('closet120','n',0,3.5);
    T.against('sofa','w',0,3.9);T.item('tapete',2.3,3.9,1);T.against('tv','s',5,3.2);T.item('planta',4.25,4.7);
    T.against('ducha','n',0,5.7);T.against('sanitario','e',7,1.5);T.against('lavamanos','w',4.6,1.6);
    T.against('cocina','s',5,5.8);T.against('nevera','e',7,3.9);T.item('mesacafe',5.3,3.4);
  }

  function house(T){
    T.perimeter(0,0,10,8);T.wall(6.5,0,6.5,8);T.wall(6.5,3.2,10,3.2);T.wall(6.5,5.2,10,5.2);
    T.floor(0,0,6.5,8,'Sala, comedor y cocina','madera');T.floor(6.5,0,10,3.2,'Dormitorio principal','madera');
    T.floor(6.5,3.2,10,5.2,'Baño','gris_claro');T.floor(6.5,5.2,10,8,'Dormitorio 2','madera');
    T.door(5.5,8,{w:1});T.door(6.5,1.6);T.door(6.5,4.2,{w:.8});T.door(6.5,6.6);
    T.window(1.8,0);T.window(4.8,0);T.window(1.2,8);T.window(10,1.6);T.window(10,6.6);T.window(10,4.2,{w:.6,h:.6,sill:1.5});
    T.against('cocina','n',0,1.2);T.against('nevera','n',0,2.55);
    T.item('mesa',3.2,2.7,0);T.item('silla',2.8,1.9,0);T.item('silla',3.6,1.9,0);T.item('silla',2.8,3.5,2);T.item('silla',3.6,3.5,2);
    T.against('tv','s',8,3.0);T.item('sofa',3.0,5.0,0);T.item('tapete',3.0,6.2,0);T.item('planta',6.0,.5);T.item('lampara',1.0,6.8);
    T.against('cama160','n',0,8.2);T.against('mesanoche','n',0,7.0);T.against('mesanoche','n',0,9.5);T.against('closet240','s',3.2,8.5);
    T.against('ducha','n',3.2,9.2);T.against('sanitario','e',10,4.7);T.against('lavamanos','s',5.2,8.0);
    T.against('cama100','n',5.2,8.7);T.against('mesanoche','n',5.2,9.65);T.against('escritorio','s',8,7.6);T.item('silla',7.6,7.0,0);T.against('closet120','s',8,9.2);
  }

  function twoStoryHouse(T){
    T.perimeter(0,0,9,7);T.wall(3.5,0,3.5,7);T.wall(0,5,3.5,5);
    T.floor(0,0,3.5,5,'Cocina y comedor','gris_claro');T.floor(0,5,3.5,7,'Baño social','gris_claro');T.floor(3.5,0,9,7,'Sala','madera');
    T.door(6.2,7,{w:1});T.door(3.5,2.5,{w:1.8});T.door(2.8,5,{w:.8});
    T.window(1.7,0);T.window(5,0,{w:1.6});T.window(7.8,0,{w:1.2});T.window(9,1.4,{w:1.2});T.window(9,5.6,{w:1.2});T.window(1.2,7,{w:.6,h:.6,sill:1.5});
    T.against('cocina','n',0,1.2);T.against('nevera','n',0,2.7);
    T.item('mesa',1.7,2.9,0);T.item('silla',1.3,2.0,0);T.item('silla',2.1,2.0,0);T.item('silla',1.3,3.8,2);T.item('silla',2.1,3.8,2);
    T.against('tv','n',0,6.2);T.item('sofa',6.2,5.9,2);T.item('tapete',6.2,5.0,0);T.item('planta',8.5,.5);T.item('lampara',3.9,6.5);
    T.against('ducha','s',7,2.7);T.against('sanitario','w',0,6.3);T.against('lavamanos','w',0,5.5);
    T.stair(7.0,3.7,.9,3.6,3);

    T.level('Piso 1');
    T.perimeter(0,0,9,7);T.wall(0,3,9,3);T.wall(0,4.4,9,4.4);T.wall(3,0,3,3);T.wall(6,0,6,3);T.wall(3.2,4.4,3.2,7);T.wall(6.2,4.4,6.2,7);
    T.floor(0,0,3,3,'Dormitorio 1','madera');T.floor(3,0,6,3,'Dormitorio 2','madera');T.floor(6,0,9,3,'Dormitorio principal','madera');
    T.floor(0,3,9,4.4,'Pasillo','gris_claro');
    T.floor(0,4.4,3.2,7,'Baño','gris_claro');T.floor(3.2,4.4,6.2,7,'Dormitorio 3','madera');T.floor(6.2,4.4,9,7,'Estudio','madera');
    for(const x of[1.5,4.5,7.5])T.door(x,3);
    for(const x of[1.6,4.7,7.6])T.door(x,4.4,{w:x<3?.8:.9});
    for(const x of[1.5,4.5,7.5])T.window(x,0);
    for(const x of[4.7,7.6])T.window(x,7);
    T.window(1.6,7,{w:.6,h:.6,sill:1.5});T.window(0,3.7,{w:.8});
    T.against('cama100','n',0,1.5);T.against('mesanoche','n',0,2.5);T.against('closet120','w',0,2.0);
    T.against('cama140','n',0,4.5);T.against('mesanoche','n',0,3.45);T.against('mesanoche','n',0,5.55);
    T.against('cama160','n',0,7.45);T.against('mesanoche','n',0,6.3);T.against('mesanoche','n',0,8.55);T.against('closet120','e',9,1.7);
    T.against('ducha','s',7,2.4);T.against('sanitario','w',0,5.7);T.against('lavamanos','n',4.4,.8);
    T.against('cama100','s',7,4.7);T.against('mesanoche','s',7,3.75);T.against('closet120','e',6.2,5.6);
    T.against('escritorio','s',7,7.6);T.item('silla',7.6,5.95,0);T.against('estante','e',9,5.6);T.item('planta',8.5,4.95);
  }

  const APARTMENT_FLOOR='madera';
  // the left apartment of a storey; the right one is the same drawn mirrored
  function apartment(T){
    T.wall(0,6.5,6.5,6.5);T.wall(3.5,6.5,3.5,12);T.wall(3.5,9.2,6.5,9.2);
    T.floor(0,0,6.5,6.5,'Sala y cocina',APARTMENT_FLOOR);T.floor(0,6.5,3.5,12,'Dormitorio',APARTMENT_FLOOR);
    T.floor(3.5,6.5,6.5,9.2,'Baño','gris_claro');T.floor(3.5,9.2,6.5,12,'Estudio',APARTMENT_FLOOR);
    T.door(6.5,3);T.door(1.7,6.5,{w:.8});T.door(5.0,6.5,{w:.8});T.door(3.5,10.6,{w:.8});
    T.window(0,3.2,{w:1.6});T.window(0,9.2,{w:1.2});T.window(5,0,{w:1.4});T.window(2,0,{w:1.0});T.window(5.1,12,{w:1.0});
    T.against('tv','n',0,2.7);T.against('sofa','s',6.5,2.7);T.item('tapete',2.7,4.7,0);
    T.against('cocina','e',6.5,5.2);T.against('nevera','e',6.5,3.9);T.item('mesa',4.6,3.2,0);T.item('silla',4.2,2.3,0);T.item('silla',5.0,2.3,0);
    T.against('cama140','w',0,9.2);T.against('mesanoche','w',0,8.0);T.against('mesanoche','w',0,10.4);T.against('closet120','s',12,2.4);
    T.against('ducha','e',6.5,7.7);T.against('sanitario','s',9.2,4.3);T.against('lavamanos','s',9.2,5.4);
    T.against('escritorio','e',6.5,10.6);T.item('silla',5.3,10.6,1);T.against('estante','s',12,4.0);
  }

  function building(T){
    const WIDTH=16;
    T.rename('Planta baja');
    T.perimeter(0,0,WIDTH,12);T.wall(6.5,0,6.5,12);T.wall(9.5,0,9.5,12);
    T.floor(0,0,6.5,12,'Local 1','cemento');T.floor(6.5,0,9.5,12,'Lobby y escaleras','marmol_blanco');T.floor(9.5,0,WIDTH,12,'Local 2','cemento');
    T.door(8,12,{w:1.6});T.door(6.5,9,{w:1.2});T.door(9.5,9,{w:1.2});
    T.window(3.2,12,{w:3,h:1.8,sill:.5});T.window(12.8,12,{w:3,h:1.8,sill:.5});
    T.window(0,3);T.window(0,8);T.window(WIDTH,3);T.window(WIDTH,8);
    T.against('barra','n',0,3.25);T.item('mesacafe',2.0,6.5);T.item('mesacafe',4.5,6.5);T.item('mesacafe',2.0,9.0);T.item('mesacafe',4.5,9.0);T.item('planta',.6,11.2);
    T.against('escritorio','n',0,11.5);T.against('escritorio','n',0,14.5);T.item('silla',11.5,1.3,2);T.item('silla',14.5,1.3,2);
    T.against('estante','e',WIDTH,6.0);T.item('planta',15.2,10.9);
    T.stair(8,3,1.2,3.6,0);
    for(const name of['Piso 1','Piso 2','Piso 3']){
      T.level(name);
      T.perimeter(0,0,WIDTH,12);T.wall(6.5,0,6.5,12);T.wall(9.5,0,9.5,12);
      T.floor(6.5,0,9.5,12,'Escalera y pasillo','marmol_blanco');T.window(8,12,{w:1.6});
      apartment(T);T.mirrored(WIDTH,()=>apartment(T));
      if(name!=='Piso 3')T.stair(8,3,1.2,3.6,0);
    }
  }

  function office(T){
    T.perimeter(0,0,12,8);T.wall(4,0,4,3.5);T.wall(0,3.5,4,3.5);T.wall(8,0,8,3.5);T.wall(8,3.5,12,3.5);T.wall(10,0,10,3.5);
    T.floor(0,0,4,3.5,'Sala de reuniones','madera');T.floor(4,0,8,3.5,'Recepción','marmol_blanco');
    T.floor(8,0,10,3.5,'Baño 1','gris_claro');T.floor(10,0,12,3.5,'Baño 2','gris_claro');T.floor(0,3.5,12,8,'Oficina abierta','cemento');
    T.door(6,8,{w:1.4});T.door(4,1.7);T.door(2,3.5);T.door(9,3.5,{w:.8});T.door(11,3.5,{w:.8});
    T.window(2,0,{w:2});T.window(6,0,{w:2});T.window(2,8,{w:2,h:1.4,sill:.8});T.window(10,8,{w:2,h:1.4,sill:.8});T.window(0,6,{w:2});T.window(12,6,{w:2});
    T.item('mesa',2,1.75,0);T.item('silla',1.5,.95,0);T.item('silla',2.5,.95,0);T.item('silla',1.5,2.55,2);T.item('silla',2.5,2.55,2);T.against('tv','w',0,1.75);
    T.against('barra','n',0,6);T.item('sillon',4.9,2.7,2);T.item('sillon',7.1,2.7,2);T.item('planta',7.6,1.6);
    T.against('sanitario','n',0,8.6);T.against('lavamanos','n',0,9.5);T.against('sanitario','n',0,10.6);T.against('lavamanos','n',0,11.5);
    for(const x of[1.6,3.6,5.6,7.6,9.6]){
      T.item('escritorio',x,4.5,0);T.item('silla',x,5.2,2);
      T.item('escritorio',x,6.6,2);T.item('silla',x,5.95,0);
    }
    T.item('planta',.6,7.4);T.item('planta',11.4,7.4);T.against('estante','e',12,4.6);
  }

  function cafe(T){
    T.perimeter(0,0,10,8);T.wall(0,2.5,7,2.5);T.wall(7,0,7,2.5);T.wall(7,2.5,10,2.5);
    T.floor(0,0,7,2.5,'Cocina','gris_claro');T.floor(7,0,10,2.5,'Baño','gris_claro');T.floor(0,2.5,10,8,'Salón','madera');
    T.door(5,8,{w:1.4});T.door(3.5,2.5,{w:1});T.door(8.5,2.5,{w:.8});
    T.window(1.8,8,{w:2.2,h:1.6,sill:.6});T.window(8.2,8,{w:2.2,h:1.6,sill:.6});T.window(0,5.2,{w:1.6});T.window(10,5.2,{w:1.6});T.window(5,0,{w:1.4});
    T.against('cocina','n',0,1.2);T.against('cocina','n',0,3.0);T.against('nevera','n',0,4.5);
    T.against('barra','n',2.5,6.0);for(const x of[5.0,6.0,7.0])T.item('silla',x,3.65,2);
    for(const[x,z]of[[1.8,4.9],[4.6,4.9],[7.4,4.9],[1.8,6.7],[8.2,6.7]]){
      T.item('mesacafe',x,z,0);T.item('silla',x-.7,z,1);T.item('silla',x+.7,z,3);
    }
    T.against('sanitario','n',0,8.2);T.against('lavamanos','n',0,9.2);T.item('planta',.6,7.4);
  }

  function park(T){
    const GRASS='cesped',PATH='adoquin';
    // north-west: playground sand inside a grass border
    T.floor(0,0,13.5,2,'Césped',GRASS);T.floor(0,2,3,8.5,'Césped',GRASS);T.floor(3,2,10,8.5,'Zona de juegos','arena');
    T.floor(10,2,13.5,8.5,'Césped',GRASS);T.floor(0,8.5,13.5,10.5,'Césped',GRASS);
    // north-east: a kiosk on a paved square
    T.floor(16.5,0,30,3,'Césped',GRASS);T.floor(16.5,3,21,7,'Césped',GRASS);T.floor(21,3,27,7,'Kiosco','pavimento');
    T.floor(27,3,30,7,'Césped',GRASS);T.floor(16.5,7,30,10.5,'Césped',GRASS);
    T.perimeter(21,3,27,7);T.door(24,7,{w:1.2});T.window(24,3,{w:1.6});T.window(27,5,{w:1.2});
    // south-west: open lawn
    T.floor(0,13.5,13.5,24,'Césped',GRASS);
    // south-east: a pond
    T.floor(16.5,13.5,30,16,'Césped',GRASS);T.floor(16.5,16,20,22,'Césped',GRASS);T.floor(20,16,27,22,'Estanque','agua');
    T.floor(27,16,30,22,'Césped',GRASS);T.floor(16.5,22,30,24,'Césped',GRASS);
    // paths cross at a plaza with a fountain
    T.floor(0,10.5,13.5,13.5,'Camino',PATH);T.floor(16.5,10.5,30,13.5,'Camino',PATH);
    T.floor(13.5,0,16.5,10.5,'Camino',PATH);T.floor(13.5,13.5,16.5,24,'Camino',PATH);T.floor(13.5,10.5,16.5,13.5,'Plaza','pavimento');
    T.item('fuente',15,12);
    T.against('barra','n',3,24);T.item('mesacafe',22.0,8.4);T.item('mesacafe',26,8.4);
    for(const[x,z]of[[1.5,1],[6.5,1],[12,1],[1.5,5],[11,3.2],[3,9.5],[9,9.5],[18.5,1.5],[28,1.5],[18.5,5],[28.5,5],[19,9],[29,9],
      [2,15],[6,15.2],[11,16.6],[2,22],[12,22],[8,22],[18,14.8],[21,14.9],[28,14.8],[28.8,19],[18.2,19],[19,23],[24,23],[29,23]])T.item('arbol',x,z);
    for(const[x,z]of[[4.2,14.6],[9,14.6],[19.6,15.3],[26.5,15.2],[.7,9.9],[13.0,9.9]])T.item('arbusto',x,z);
    for(const[x,z]of[[13.2,1.5],[16.8,2],[13.2,8],[16.8,9],[13.2,15],[16.8,15],[13.2,21],[16.8,21]])T.item('farola',x,z);
    for(const[x,z,r]of[[6,10.0,0],[11.2,10.0,0],[22,10.0,0],[6,14.0,2],[11.2,14.0,2],[24,14.4,2],[16.9,5.5,3],[13.1,6.2,1],[13.1,18,1],[16.9,19,3]])T.item('bancoparque',x,z,r);
    T.item('mesapicnic',4.8,19);T.item('mesapicnic',9.2,19);
    T.item('bancoparque',4,2.9,0);T.item('bancoparque',9,2.9,0);T.item('bancoparque',4,7.7,2);T.item('bancoparque',9,7.7,2);
  }

  function loft(T){
    T.perimeter(0,0,10,6);T.wall(7.4,0,7.4,2.4);T.wall(7.4,2.4,10,2.4);
    T.floor(0,0,7.4,6,'Loft','madera');T.floor(7.4,0,10,2.4,'Baño','gris_claro');T.floor(7.4,2.4,10,6,'Cocina','cemento');
    T.door(1.5,6);T.door(7.4,1.2,{w:.8});
    T.window(2.8,6,{w:1.6});T.window(5.4,6,{w:1.6});T.window(0,3,{w:1.4});T.window(10,4.2,{w:1.4});T.window(8.6,0,{w:.8,h:.6,sill:1.5});
    T.against('cama160','w',0,1.5);T.against('mesanoche','w',0,.35);T.against('mesanoche','w',0,2.7);T.against('closet240','n',0,4.0);
    T.against('tv','n',0,6.5);T.item('sofa',6.0,4.2,2);T.item('tapete',6.0,2.9,0);
    T.against('escritorio','w',0,4.6);T.item('silla',1.15,4.6,3);
    T.item('mesa',3.2,4.6,0);T.item('silla',2.8,3.85,0);T.item('silla',3.6,3.85,0);T.item('silla',2.8,5.35,2);T.item('silla',3.6,5.35,2);
    T.against('cocina','n',2.4,8.7);T.against('nevera','e',10,4.2);T.item('barra',8.7,4.9,0);
    T.against('ducha','n',0,8.6);T.against('sanitario','e',10,1.5);T.against('lavamanos','e',10,.55);
  }

  function apartment2(T){
    T.perimeter(0,0,10,7.5);T.wall(5.5,0,5.5,7.5);T.wall(5.5,3.2,10,3.2);T.wall(5.5,4.7,10,4.7);
    T.floor(0,0,5.5,7.5,'Sala, comedor y cocina','madera');T.floor(5.5,0,10,3.2,'Dormitorio principal','madera');
    T.floor(5.5,3.2,10,4.7,'Baño','gris_claro');T.floor(5.5,4.7,10,7.5,'Dormitorio 2','madera');
    T.door(1.6,7.5,{w:1});T.door(5.5,1.6);T.door(5.5,3.95,{w:.8});T.door(5.5,6.1);
    T.window(1.6,0);T.window(4.0,0);T.window(3.5,7.5,{w:1.4});T.window(8.0,0,{w:1.4});T.window(10,5.4,{w:.8});T.window(10,3.95,{w:.5,h:.5,sill:1.6});
    T.against('cocina','n',0,1.2);T.against('nevera','n',0,2.55);
    T.item('mesa',3.8,2.9,0);T.item('silla',3.4,2.1,0);T.item('silla',4.2,2.1,0);T.item('silla',3.4,3.7,2);T.item('silla',4.2,3.7,2);
    T.against('tv','w',0,5.2);T.item('sofa',3.8,5.2,3);T.item('tapete',2.4,5.2,1);T.item('planta',5.0,7.0);
    T.against('cama160','n',0,8.0);T.against('mesanoche','n',0,6.75);T.against('mesanoche','n',0,9.45);T.against('closet120','e',10,2.3);
    T.against('ducha','n',3.2,9.0);T.against('sanitario','s',4.7,6.4);T.against('lavamanos','s',4.7,7.4);
    T.against('cama100','n',4.7,8.5);T.against('mesanoche','n',4.7,9.6);T.against('escritorio','s',7.5,6.9);T.item('silla',6.9,6.4,0);T.against('closet120','e',10,6.75);
  }

  function cabin(T){
    T.walls({t:'madera',c:'#e8dece'});
    T.perimeter(0,0,8,6);T.wall(5,0,5,6);T.wall(5,3.4,8,3.4);
    T.floor(0,0,5,6,'Sala y cocina','madera');T.floor(5,0,8,3.4,'Dormitorio','madera');T.floor(5,3.4,8,6,'Baño','gris_claro');
    T.door(2.5,6,{w:1});T.door(5,1.7);T.door(5,4.7,{w:.8});
    T.window(1.4,0,{w:1.4});T.window(3.6,0,{w:1.0});T.window(0,3.2,{w:1.4});T.window(8,1.7,{w:1.2});T.window(8,4.7,{w:.5,h:.5,sill:1.6});T.window(4.4,6,{w:.8});
    T.against('cocina','n',0,1.2);T.against('nevera','n',0,2.55);T.against('sofa','w',0,3.6);T.against('tv','e',5,3.2);
    T.item('mesacafe',3.4,1.9);T.item('silla',2.65,1.9,1);T.item('silla',4.15,1.9,3);T.item('planta',4.5,5.3);
    T.against('cama140','n',0,6.5);T.against('mesanoche','n',0,5.45);T.against('mesanoche','n',0,7.55);T.against('closet120','e',8,2.6);
    T.against('ducha','e',8,4.2);T.against('sanitario','s',6,6.0);T.against('lavamanos','s',6,5.3);
  }

  function houseWithGarden(T){
    const GRASS='cesped';
    T.floor(0,0,24,3,'Jardín',GRASS);T.floor(0,3,2,11,'Jardín',GRASS);
    T.floor(12,3,24,5,'Jardín',GRASS);T.floor(12,5,15,9,'Jardín',GRASS);T.floor(15,5,22,9,'Piscina','agua');T.floor(22,5,24,9,'Jardín',GRASS);T.floor(12,9,24,11,'Jardín',GRASS);
    T.floor(0,11,6.5,18,'Jardín',GRASS);T.floor(6.5,11,8.5,18,'Camino','adoquin');T.floor(8.5,11,24,18,'Jardín',GRASS);
    T.moved(2,3,()=>house(T));
    for(const[x,z]of[[3,1.5],[10,1.5],[18,1.5],[22.5,1.5],[3,16.2],[11,15],[15.5,16.5],[21,15],[22.5,12.8],[1,7]])T.item('arbol',x,z);
    for(const[x,z]of[[13.2,4.0],[1,11.6],[5.2,11.8]])T.item('arbusto',x,z);
    for(const x of[16.5,18.5,20.5])T.item('tumbona',x,10.0,0);
    T.item('bancoparque',13.3,7,1);T.item('mesapicnic',18.5,14.5);T.item('farola',8.9,12);T.item('farola',6.1,12);
  }

  function hotelRoom(T,x0){
    T.floor(x0,0,x0+4,3.4,'Habitación','madera');T.floor(x0+1.8,3.4,x0+4,5,'Entrada','madera');T.floor(x0,3.4,x0+1.8,5,'Baño','gris_claro');
    T.wall(x0,3.4,x0+1.8,3.4);T.wall(x0+1.8,3.4,x0+1.8,5);
    T.door(x0+3,5);T.door(x0+1.8,4.3,{w:.8});T.window(x0+2,0,{w:1.4});
    T.against('cama140','n',0,x0+2.2);T.against('mesanoche','n',0,x0+.45);T.against('mesanoche','n',0,x0+3.55);
    T.against('escritorio','e',x0+4,2.4);T.item('silla',x0+2.8,2.4,1);T.against('tv','w',x0,1.7);
    T.against('ducha','w',x0,4.1);T.against('sanitario','n',3.4,x0+1.4);T.against('lavamanos','s',5,x0+1.35);
  }
  function hotel(T){
    const W=24;
    T.perimeter(0,0,W,12);T.wall(12,0,12,12);
    T.floor(0,0,12,12,'Lobby','marmol_blanco');T.floor(12,0,W,12,'Restaurante','madera');
    T.door(6,12,{w:2});T.door(12,9,{w:2});T.window(2,12,{w:2.4,h:1.8,sill:.4});T.window(10,12,{w:1.4});T.window(16,12,{w:2.4,h:1.6,sill:.6});T.window(21,12,{w:2.4,h:1.6,sill:.6});
    T.window(3,0,{w:2.4});T.window(18,0,{w:2.4});T.window(0,6);T.window(W,6);
    T.against('barra','n',0,3.0);T.item('sillon',2.0,10.3,2);T.item('sillon',3.2,10.3,2);T.item('sofa',5.0,9.5,2);T.item('planta',.6,.6);T.item('planta',11.4,11.4);
    for(const x of[14.5,17.5,20.5])for(const z of[3,6])T.item('mesacafe',x,z);
    for(const x of[14.5,17.5,20.5])for(const z of[3,6]){T.item('silla',x-.7,z,1);T.item('silla',x+.7,z,3);}
    T.against('barra','e',W,9.6);
    T.stair(9,6,.9,3.6,3);
    for(const name of['Piso 1','Piso 2']){
      T.level(name);
      T.perimeter(0,0,W,12);T.wall(0,5,W,5);T.wall(0,7,W,7);
      T.floor(0,5,W,7,'Pasillo','marmol_blanco');T.window(0,6,{w:.8});T.window(W,6,{w:.8});
      for(let i=0;i<6;i++){
        const x0=4*i;
        if(i>0){T.wall(x0,0,x0,5);T.wall(x0,7,x0,12);}
        hotelRoom(T,x0);T.flipped(12,()=>hotelRoom(T,x0));
      }
      if(name==='Piso 1')T.stair(9,6,.9,3.6,3);
    }
  }

  function classroom(T,x0){
    T.floor(x0,0,x0+6,6,'Aula','gris_claro');
    T.door(x0+3,6);T.window(x0+3,0,{w:2.4});
    T.against('pizarra','w',x0,3.0);T.against('escritorio','n',0,x0+1.2);
    for(const dx of[2.2,3.4,4.6])for(const z of[1.4,3.0,4.6])T.item('pupitre',x0+dx,z,3);
  }
  function school(T){
    T.perimeter(0,0,30,14);T.wall(0,6,30,6);T.wall(0,8,30,8);
    for(const x of[6,12,18,24])T.wall(x,0,x,6);
    for(const x of[10,20,25,27.5])T.wall(x,8,x,14);
    T.floor(0,6,30,8,'Pasillo','gris_claro');
    for(const x0 of[0,6,12,18,24])classroom(T,x0);
    T.floor(0,8,10,14,'Biblioteca','madera');T.floor(10,8,20,14,'Comedor','madera');T.floor(20,8,25,14,'Dirección','madera');
    T.floor(25,8,27.5,14,'Baño niñas','gris_claro');T.floor(27.5,8,30,14,'Baño niños','gris_claro');
    for(const x of[5,15,22.5])T.door(x,8);
    T.door(26.25,8,{w:.8});T.door(28.75,8,{w:.8});T.door(0,7,{w:1.4});T.door(30,7,{w:1.4});T.door(15,14,{w:1.6});
    T.window(3,14,{w:2.4});T.window(7,14,{w:1.6});T.window(23,14,{w:2.4});
    for(const x of[1.2,2.1,3.0,3.9,4.8,5.7])T.against('estante','s',14,x+0.0);
    T.item('mesa',3.0,10.5,0);T.item('silla',2.6,9.7,0);T.item('silla',3.4,9.7,0);T.item('silla',2.6,11.3,2);T.item('silla',3.4,11.3,2);
    T.item('mesa',6.8,10.5,0);T.item('silla',6.4,9.7,0);T.item('silla',7.2,9.7,0);T.item('silla',6.4,11.3,2);T.item('silla',7.2,11.3,2);
    for(const x of[12.5,16,19.2])for(const z of[10,12.5])T.item('mesa',x,z,0);
    T.against('cocina','s',14,11.5);T.against('nevera','s',14,13.0);
    T.against('escritorio','n',8,22.5);T.item('silla',22.5,9.4,2);T.item('sillon',23.9,12.6,2);T.against('estante','e',25,12);
    T.against('sanitario','s',14,25.8);T.against('sanitario','s',14,26.7);T.against('lavamanos','w',25,10.0);
    T.against('sanitario','s',14,28.0);T.against('sanitario','s',14,29.0);T.against('lavamanos','w',27.5,10.0);
    T.floor(0,14,6,24,'Patio','pavimento');T.floor(6,14,24,24,'Cancha','cancha');T.floor(24,14,30,24,'Patio','pavimento');
    T.item('canasta',15,15.2,0);T.item('canasta',15,22.8,2);
    for(const[x,z]of[[2.5,16],[2.5,21],[27.5,16],[27.5,21]])T.item('arbol',x,z);
    T.item('bancoparque',29.2,18.5,3);T.item('bancoparque',0.8,18.5,1);T.item('farola',5,15);T.item('farola',25,15);
  }

  function library(T){
    T.perimeter(0,0,16,10);T.wall(11,0,11,4);T.wall(11,4,16,4);
    T.floor(0,0,11,10,'Sala de lectura','madera');T.floor(11,4,16,10,'Sala de lectura','madera');T.floor(11,0,16,4,'Administración','gris_claro');
    T.door(13.5,10,{w:1.4});T.door(11,2);
    T.window(2,0,{w:2});T.window(5.5,0,{w:2});T.window(8.5,0,{w:2});T.window(0,5,{w:2});T.window(3,10,{w:2});T.window(7,10,{w:2});
    for(const z of[1.4,3.6])for(let i=0;i<6;i++){T.item('estante',1.4+.9*i,z,0);T.item('estante',1.4+.9*i,z+.35,2);}
    for(const x of[2.5,5.5,8.5]){T.item('mesa',x,7.0,0);T.item('silla',x-.4,6.2,0);T.item('silla',x+.4,6.2,0);T.item('silla',x-.4,7.8,2);T.item('silla',x+.4,7.8,2);}
    T.against('barra','e',16,6.5);T.against('escritorio','n',0,13.0);T.item('silla',13.0,1.5,2);T.against('estante','e',16,2.5);T.item('planta',11.7,9.3);T.item('sillon',1.0,9.2,2);
  }

  function gym(T){
    T.perimeter(0,0,16,10);T.wall(10.5,0,10.5,10);T.wall(10.5,6,16,6);
    T.floor(0,0,10.5,10,'Sala de máquinas','cemento');T.floor(10.5,0,16,6,'Vestuario','gris_claro');T.floor(10.5,6,16,10,'Baños','gris_claro');
    T.door(5,10,{w:1.6});T.door(10.5,3);T.door(10.5,8);
    T.window(2,0,{w:2.4});T.window(6,0,{w:2.4});T.window(3,10,{w:2});T.window(8,10,{w:1.4});
    for(const x of[1.5,3.0,4.5,6.0,7.5])T.against('caminadora','n',0,x);
    T.against('mancuernas','w',0,6.0);T.against('mancuernas','w',0,8.0);
    for(const x of[3,6,9])T.item('tapete',x,7.5,0);
    for(const x of[2,4.5,7])T.item('banco',x,5.2,0);
    T.against('ducha','n',0,12.0);T.against('ducha','n',0,13.5);T.item('banco',13.2,3.3,0);T.item('banco',13.2,4.7,0);
    T.against('sanitario','n',6,11.7);T.against('sanitario','n',6,13.0);T.against('lavamanos','s',10,12.0);T.against('lavamanos','s',10,14.0);
  }

  function clinic(T){
    T.perimeter(0,0,20,12);T.wall(0,5,20,5);
    for(const x of[5,10,15])T.wall(x,0,x,5);
    for(const x0 of[0,5,10])T.floor(x0,0,x0+5,5,'Consultorio','gris_claro');
    T.floor(15,0,20,5,'Baño','gris_claro');T.floor(0,5,20,12,'Recepción y espera','marmol_blanco');
    for(const x of[2.5,7.5,12.5])T.door(x,5);
    T.door(17.5,5,{w:.8});T.door(10,12,{w:1.8});
    for(const x of[2.5,7.5,12.5])T.window(x,0,{w:1.4});
    T.window(3,12,{w:2.4});T.window(17,12,{w:2.4});T.window(0,8);T.window(20,8);
    for(const x0 of[0,5,10]){
      T.against('escritorio','n',0,x0+1.4);T.item('silla',x0+1.4,1.45,2);T.item('silla',x0+1.4,2.4,0);
      T.against('cama100','e',x0+5,3.3);T.against('estante','w',x0,3.9);
    }
    T.against('sanitario','n',0,16.5);T.against('lavamanos','n',0,18.2);
    T.against('barra','n',5,4.9);for(const x of[12.5,13.5,14.5,15.5,16.5])T.against('sillon','s',12,x);
    T.item('mesacafe',14.5,9.3);T.item('planta',.7,11.2);T.item('planta',19.3,6.0);
  }

  function church(T){
    T.perimeter(0,0,14,22);
    T.floor(0,0,14,4,'Altar','madera');T.floor(0,4,14,22,'Nave','marmol_blanco');
    T.door(7,22,{w:2});T.window(7,0,{w:2.4,h:1.6,sill:1.0});
    for(const z of[7,11,15])T.window(0,z,{w:1.2,h:1.6,sill:.8});
    for(const z of[7,11,15])T.window(14,z,{w:1.2,h:1.6,sill:.8});
    T.item('mesa',7,1.6,0);T.item('planta',2.0,1.0);T.item('planta',12.0,1.0);T.item('lampara',4.0,1.2);T.item('lampara',10.0,1.2);
    for(let k=0;k<8;k++){
      const z=7+1.2*k;
      T.item('bancoparque',2.6,z,2);T.item('bancoparque',4.35,z,2);T.item('bancoparque',9.65,z,2);T.item('bancoparque',11.4,z,2);
    }
  }

  function warehouse(T){
    T.perimeter(0,0,30,18);T.wall(8,0,8,6);T.wall(0,6,8,6);
    T.floor(0,0,8,6,'Oficina','gris_claro');T.floor(8,0,30,18,'Almacén','cemento');T.floor(0,6,8,18,'Almacén','cemento');
    T.door(8,3);T.door(10,18,{w:3,h:2.3});T.door(20,18,{w:3,h:2.3});T.door(0,12,{w:1});
    T.window(4,0,{w:2});T.window(14,0,{w:3,h:.8,sill:1.4});T.window(24,0,{w:3,h:.8,sill:1.4});T.window(30,9,{w:2,h:.8,sill:1.4});
    T.against('escritorio','n',0,2.0);T.item('silla',2.0,1.5,2);T.against('estante','w',0,3.5);T.against('estante','e',8,2.0);
    for(const z of[3.0,7.0,11.0])for(let i=0;i<20;i++){T.item('estante',9.6+.9*i,z,0);T.item('estante',9.6+.9*i,z+.35,2);}
    for(let i=0;i<6;i++){T.item('estante',.7+.9*i,12.0,0);T.item('estante',.7+.9*i,12.35,2);}
  }

  function garage(T){
    T.perimeter(0,0,7,6);T.floor(0,0,7,6,'Garaje','cemento');
    T.door(3.5,6,{w:4,h:2.3});T.door(7,2,{w:.9});T.window(0,3,{w:1.4});
    T.item('auto',1.8,3.0,0);T.item('auto',5.2,3.0,0);T.against('estante','n',0,3.5);
  }

  function parking(T){
    T.floor(0,0,36,2,'Acera','adoquin');T.floor(0,20,36,22,'Acera','adoquin');T.floor(0,2,2,20,'Acera','adoquin');T.floor(34,2,36,20,'Acera','adoquin');
    T.floor(2,2,34,20,'Estacionamiento','pavimento');
    for(let i=0;i<10;i++)if(i!==4&&i!==8)T.item('auto',4+2.7*i,5.4,0);
    for(let i=0;i<10;i++)if(i!==2&&i!==6)T.item('auto',4+2.7*i,16.6,2);
    for(const x of[7,15,23,31])T.item('farola',x,11);
    for(const z of[5,11,17])T.item('arbusto',1,z);
    for(const z of[5,11,17])T.item('arbusto',35,z);
    T.item('arbol',3,1);T.item('arbol',33,1);T.item('arbol',3,21);T.item('arbol',33,21);
  }

  function sportsComplex(T){
    T.floor(0,0,40,2,'Pavimento','pavimento');T.floor(0,24,40,26,'Pavimento','pavimento');T.floor(0,2,2,24,'Pavimento','pavimento');
    T.floor(2,2,26,24,'Cancha de fútbol','cancha');T.floor(26,2,28,24,'Pavimento','pavimento');
    T.floor(28,2,38,16,'Cancha de baloncesto','cancha');T.floor(28,16,38,24,'Gradas','pavimento');T.floor(38,2,40,24,'Pavimento','pavimento');
    T.item('porteria',14,2.4,0);T.item('porteria',14,23.6,2);T.item('canasta',33,3.6,0);T.item('canasta',33,14.4,2);
    for(const x of[29.5,31.5,33.5,35.5])for(const z of[18,20.5])T.item('bancoparque',x,z,2);
    for(const[x,z]of[[1,1],[12,1],[27,1],[39,1],[1,25],[27,25],[39,25]])T.item('farola',x,z);
    for(const z of[5,12,19])T.item('arbol',39,z);
  }

  function supermarket(T){
    T.perimeter(0,0,24,14);T.wall(16,10,16,14);T.wall(16,10,24,10);
    T.floor(0,0,24,10,'Salón de ventas','marmol_blanco');T.floor(0,10,16,14,'Cajas y entrada','gris_claro');T.floor(16,10,24,14,'Bodega','cemento');
    T.door(6,14,{w:2});T.door(16,12,{w:1.2});T.door(20,14,{w:1.6,h:2.3});T.window(2.5,14,{w:2});T.window(10.5,14,{w:2.4});
    for(let i=0;i<10;i++)T.against('nevera','n',0,1.0+.8*i);
    for(const z of[3.2,6.0])for(let i=0;i<16;i++){T.item('estante',3.0+.85*i,z,0);T.item('estante',3.0+.85*i,z+.35,2);}
    for(const x of[11.5,14.2])T.item('barra',x,11.6,0);T.item('barra',2.2,11.6,0);
    for(let i=0;i<4;i++)T.against('estante','s',14,17.5+.9*i);T.against('estante','n',10,22.0);
  }

  function restaurant(T){
    T.perimeter(0,0,16,10);T.wall(0,3.5,9,3.5);T.wall(9,0,9,3.5);T.wall(9,3.5,16,3.5);T.wall(12.5,0,12.5,3.5);
    T.floor(0,0,9,3.5,'Cocina','gris_claro');T.floor(9,0,12.5,3.5,'Baño 1','gris_claro');T.floor(12.5,0,16,3.5,'Baño 2','gris_claro');T.floor(0,3.5,16,10,'Salón','madera');
    T.door(8,10,{w:1.6});T.door(4.5,3.5,{w:1});T.door(10.75,3.5,{w:.8});T.door(14.25,3.5,{w:.8});
    T.window(3,10,{w:2.4,h:1.6,sill:.6});T.window(13,10,{w:2.4,h:1.6,sill:.6});T.window(0,7,{w:1.6});T.window(16,7,{w:1.6});T.window(2,0,{w:1.4});
    T.against('cocina','n',0,1.2);T.against('cocina','n',0,3.0);T.against('cocina','n',0,4.8);T.against('nevera','n',0,6.4);T.against('barra','n',3.5,7.5);
    for(const x of[2.0,5.2,8.4,11.6,14.8]){T.item('mesa',x,6.2,0);T.item('silla',x-.4,5.4,0);T.item('silla',x+.4,5.4,0);T.item('silla',x-.4,7.0,2);T.item('silla',x+.4,7.0,2);}
    for(const x of[2.0,5.2,11.2,14.4]){T.item('mesa',x,8.9,0);T.item('silla',x-.4,8.2,0);T.item('silla',x+.4,8.2,0);}
    T.against('sanitario','n',0,10.0);T.against('lavamanos','n',0,11.6);T.against('sanitario','n',0,13.5);T.against('lavamanos','n',0,15.0);T.item('planta',.6,9.4);
  }

  function shop(T){
    T.perimeter(0,0,10,7);T.wall(7,0,7,2.5);T.wall(7,2.5,10,2.5);T.wall(8.5,0,8.5,2.5);
    T.floor(0,0,7,7,'Tienda','madera');T.floor(7,2.5,10,7,'Tienda','madera');T.floor(7,0,8.5,2.5,'Probador 1','gris_claro');T.floor(8.5,0,10,2.5,'Probador 2','gris_claro');
    T.door(5,7,{w:1.2});T.door(7.75,2.5,{w:.8});T.door(9.25,2.5,{w:.8});T.window(2,7,{w:3,h:1.8,sill:.4});T.window(8.5,7,{w:1.4});T.window(0,3.5,{w:1.4});
    for(const x of[1.0,1.9,2.8,3.7,4.6,5.5])T.against('estante','n',0,x);
    T.against('estante','w',0,5.4);T.against('estante','w',0,6.3);T.against('barra','e',10,5.0);
    T.item('mesacafe',3.0,3.8);T.item('mesacafe',5.2,3.8);T.item('planta',6.5,.6);
    T.against('banco','n',0,7.75);T.against('espejo','w',7,1.7);T.against('banco','n',0,9.25);T.against('espejo','e',10,1.7);
  }

  function salon(T){
    T.perimeter(0,0,9,6);T.floor(0,0,9,6,'Salón','gris_claro');
    T.door(4.5,6,{w:1});T.window(1.5,6,{w:1.2});T.window(7.5,6,{w:1.2});T.window(0,3,{w:1.4});
    for(const x of[1.2,2.6,4.0,5.4])T.against('sillon','n',0,x);
    T.against('lavamanos','e',9,1.5);T.against('lavamanos','e',9,2.6);T.against('barra','e',9,4.7);T.against('sofa','s',6,2.4);T.item('planta',.6,5.4);
  }

  function playground(T){
    T.floor(0,0,24,4,'Césped','cesped');T.floor(0,4,4,14,'Césped','cesped');T.floor(4,4,20,14,'Zona de juegos','arena');T.floor(20,4,24,14,'Césped','cesped');
    T.floor(0,14,24,16,'Camino','adoquin');T.floor(0,16,24,18,'Césped','cesped');
    T.item('columpio',8,7);T.item('columpio',16,7);T.item('tobogan',8,11.2,0);T.item('tobogan',16,11.2,0);T.item('mesapicnic',12,9);
    T.item('bancoparque',2,9,1);T.item('bancoparque',22,9,3);T.item('bancoparque',6,15.2,0);T.item('bancoparque',18,15.2,0);
    for(const[x,z]of[[2,2],[8,2],[16,2],[22,2],[2,17],[22,17],[12,17]])T.item('arbol',x,z);
    T.item('farola',12,2);T.item('farola',12,15);
  }

  function poolClub(T){
    T.floor(0,0,28,5,'Terraza','adoquin');T.floor(0,5,6,13,'Terraza','adoquin');T.floor(6,5,22,13,'Piscina','agua');T.floor(22,5,28,13,'Terraza','adoquin');
    T.floor(0,13,2,20,'Terraza','adoquin');T.floor(2,13,12,14,'Terraza','adoquin');T.floor(2,19,12,20,'Terraza','adoquin');T.floor(12,13,28,20,'Terraza','adoquin');
    T.floor(2,14,12,19,'Club','madera');T.perimeter(2,14,12,19);T.door(7,14,{w:1.2});T.window(4,19,{w:1.6});T.window(10,19,{w:1.6});T.window(2,16.5,{w:1.2});
    T.against('barra','n',14,7);T.item('mesacafe',4,17.4);T.item('mesacafe',7.5,17.4);T.item('silla',3.3,17.4,1);T.item('silla',4.7,17.4,3);T.item('silla',6.8,17.4,1);T.item('silla',8.2,17.4,3);
    T.against('ducha','s',19,10.0);T.against('sanitario','e',12,16.0);
    for(let i=0;i<7;i++)T.item('tumbona',8+2*i,3.0,0);
    for(const x of[14.5,16.5,18.5,20.5,24])T.item('tumbona',x,15.2,2);
    for(const[x,z]of[[1.5,2],[26.5,2],[26.5,18],[14,18.5],[1,12]])T.item('arbol',x,z);
    for(const x of[3,25])T.item('farola',x,6);T.item('arbusto',25,12);T.item('arbusto',4.6,6.5);
  }

  function officeTower(T){
    T.rename('Planta baja');
    const level=name=>{
      T.perimeter(0,0,20,12);T.wall(8,0,8,12);T.wall(12,0,12,12);T.wall(8,8.5,12,8.5);
      T.floor(0,0,8,12,'Oficina A','cemento');T.floor(12,0,20,12,'Oficina B','cemento');
      T.floor(8,0,12,8.5,'Hall y escaleras','marmol_blanco');T.floor(8,8.5,12,12,'Baños','gris_claro');
      T.door(8,5,{w:1.2});T.door(12,5,{w:1.2});T.door(10,8.5,{w:.9});
      T.window(2.5,0,{w:2.4});T.window(5.5,0,{w:2.4});T.window(14.5,0,{w:2.4});T.window(17.5,0,{w:2.4});
      T.window(2.5,12,{w:2.4});T.window(5.5,12,{w:2.4});T.window(14.5,12,{w:2.4});T.window(17.5,12,{w:2.4});
      T.window(0,6,{w:2});T.window(20,6,{w:2});
      for(const[x0,x1]of[[0,2],[12,14]]){
        for(const dx of[x1===2?2.2:2.2,5.6])for(const z of[1.8,5.3,8.8]){T.item('escritorio',x0+dx,z,0);T.item('silla',x0+dx,z+.7,2);}
      }
      T.against('sanitario','s',12,9.2);T.against('sanitario','s',12,10.2);T.against('lavamanos','s',12,11.2);
    };
    level('Planta baja');
    T.against('barra','n',0,10);T.stair(10,3.5,1.2,3.6,0);
    for(const name of['Piso 1','Piso 2']){T.level(name);level(name);if(name==='Piso 1')T.stair(10,3.5,1.2,3.6,0);}
  }

  const CATALOG=[
    {key:'blank',name:'En blanco',category:'Para empezar',description:'Una cuadrícula vacía para dibujar desde cero.'},
    {key:'studio',name:'Apartaestudio',category:'Vivienda',description:'Un solo ambiente con cocina abierta y baño. 35 m².',build:studio},
    {key:'loft',name:'Loft',category:'Vivienda',description:'Un espacio abierto con cama, sala, comedor y cocina con isla, y baño aparte. 60 m².',build:loft},
    {key:'apartment2',name:'Apartamento de dos habitaciones',category:'Vivienda',description:'Sala, comedor y cocina, dos dormitorios y baño. 75 m².',build:apartment2},
    {key:'cabin',name:'Cabaña',category:'Vivienda',description:'Una cabaña de madera con sala y cocina, un dormitorio y baño. 48 m².',build:cabin},
    {key:'house',name:'Casa de un nivel',category:'Vivienda',description:'Sala, comedor y cocina abiertos, dos dormitorios y un baño. 80 m².',build:house},
    {key:'house2',name:'Casa de dos niveles',category:'Vivienda',description:'Zona social abajo, tres dormitorios, estudio y baño arriba, con escalera. 126 m².',build:twoStoryHouse,levels:2},
    {key:'garden',name:'Casa con jardín y piscina',category:'Vivienda',description:'La casa de un nivel en un lote de 24 × 18 m con jardín, piscina, tumbonas y camino de entrada.',build:houseWithGarden},
    {key:'example',name:'Casa de ejemplo',category:'Vivienda',description:'Dormitorio, pasillo y baño, con vistas fijas para recorrerlos.'},
    {key:'building',name:'Edificio de apartamentos',category:'Edificios',description:'Locales y lobby abajo y tres pisos con dos apartamentos cada uno, con escalera.',build:building,levels:4},
    {key:'hotel',name:'Hotel',category:'Edificios',description:'Lobby y restaurante abajo y dos pisos con doce habitaciones cada uno, con baño propio y escalera.',build:hotel,levels:3},
    {key:'tower',name:'Edificio de oficinas',category:'Oficinas',description:'Tres plantas con dos oficinas por piso, hall con escalera y baños. 20 × 12 m.',build:officeTower,levels:3},
    {key:'office',name:'Oficina',category:'Oficinas',description:'Recepción, sala de reuniones, baños y oficina abierta con puestos. 96 m².',build:office},
    {key:'cafe',name:'Cafetería',category:'Comercio',description:'Salón con barra y mesas, cocina y baño. 80 m².',build:cafe},
    {key:'restaurant',name:'Restaurante',category:'Comercio',description:'Salón de quince mesas, barra, cocina y dos baños. 160 m².',build:restaurant},
    {key:'shop',name:'Tienda de ropa',category:'Comercio',description:'Sala de ventas con estantes, mostrador, mesas de exhibición y dos probadores. 70 m².',build:shop},
    {key:'salon',name:'Peluquería',category:'Comercio',description:'Cuatro puestos de corte, dos lavacabezas, recepción y sala de espera. 54 m².',build:salon},
    {key:'supermarket',name:'Supermercado',category:'Comercio',description:'Neveras, góndolas, cajas y bodega con puerta de carga. 24 × 14 m.',build:supermarket},
    {key:'school',name:'Escuela',category:'Educación y salud',description:'Cinco aulas, biblioteca, comedor, dirección y baños, con patio y cancha. 30 × 24 m.',build:school},
    {key:'library',name:'Biblioteca',category:'Educación y salud',description:'Sala de lectura con estantes y mesas, mostrador y administración. 160 m².',build:library},
    {key:'clinic',name:'Clínica',category:'Educación y salud',description:'Tres consultorios, baño y una recepción con sala de espera. 240 m².',build:clinic},
    {key:'church',name:'Iglesia',category:'Comunidad',description:'Nave con treinta y dos bancas en dos columnas, altar y ventanas laterales. 14 × 22 m.',build:church},
    {key:'warehouse',name:'Bodega',category:'Industria',description:'Nave de 30 × 18 m con filas de estantes, oficina y dos puertas de carga.',build:warehouse},
    {key:'garage',name:'Garaje',category:'Industria',description:'Garaje para dos automóviles con portón y estante. 42 m².',build:garage},
    {key:'parking',name:'Estacionamiento',category:'Espacios abiertos',description:'Lote de 36 × 22 m con dos filas de autos, aceras, farolas y árboles.',build:parking},
    {key:'park',name:'Parque',category:'Espacios abiertos',description:'Plaza con fuente, caminos, zona de juegos, estanque, kiosco, árboles y bancas. 30 × 24 m.',build:park},
    {key:'playground',name:'Parque infantil',category:'Espacios abiertos',description:'Arenero con columpios y toboganes, mesa de picnic, bancas y árboles. 24 × 18 m.',build:playground},
    {key:'pool',name:'Club con piscina',category:'Espacios abiertos',description:'Piscina de 16 × 8 m con terraza, tumbonas y una casa club con barra y mesas.',build:poolClub},
    {key:'sports',name:'Complejo deportivo',category:'Deporte',description:'Cancha de fútbol con porterías, cancha de baloncesto y gradas. 40 × 26 m.',build:sportsComplex},
    {key:'gym',name:'Gimnasio',category:'Deporte',description:'Sala de máquinas con caminadoras y pesas, y vestuarios con duchas y baños. 160 m².',build:gym}
  ];

  // `makers.blank` and `makers.example` give the plan the editor starts from; the rest are drawn here
  function create(key,{blank,example,lib}){
    const entry=CATALOG.find(t=>t.key===key);
    if(!entry)throw new Error('unknown template '+key);
    if(key==='example')return Levels.ensure(example());
    const state=Levels.ensure(blank());
    if(entry.build){
      entry.build(context(state,lib));
      Levels.switchTo(state,0);
    }
    return state;
  }

  const FLOOR_COLORS={marmol_blanco:'#e6e4df',marmol_negro:'#4a4a4e',cemento:'#8e8c88',madera:'#c79d70',terrazo:'#dcd7cf',gris_claro:'#c8c7c4',
    cesped:'#4c7a3e',adoquin:'#a39a8d',arena:'#d9c79a',agua:'#3f86a8',pavimento:'#5b5d60',cancha:'#b45f3c'};
  // a flat sketch of the ground floor for the gallery cards
  function previewSvg(state,lib){
    const lv=Levels.at(state,0),F=Levels.frame(state)||{x0:0,x1:10,z0:0,z1:8},pad=.6;
    const w=F.x1-F.x0+2*pad,h=F.z1-F.z0+2*pad,n=v=>+v.toFixed(2);
    const parts=[];
    for(const f of lv.layout.floors)parts.push(`<rect x="${n(f.x-f.w/2)}" y="${n(f.z-f.d/2)}" width="${n(f.w)}" height="${n(f.d)}" fill="${FLOOR_COLORS[f.f]||'#d9d5ce'}"/>`);
    for(const st of lv.layout.stairs){const r=Layout.stairRect(st);parts.push(`<rect x="${n(r.x0)}" y="${n(r.z0)}" width="${n(r.x1-r.x0)}" height="${n(r.z1-r.z0)}" fill="#7a5a3a" opacity=".85"/>`);}
    for(const it of lv.items){
      const d=lib[it.t];if(!d)continue;
      const tree=it.t==='arbol'||it.t==='arbusto';
      parts.push(tree?`<circle cx="${n(it.x)}" cy="${n(it.z)}" r="${n(d.w/2)}" fill="#2f5d2b" opacity=".85"/>`:`<rect x="${n(it.x-d.w/2)}" y="${n(it.z-d.d/2)}" width="${n(d.w)}" height="${n(d.d)}" fill="#1b1c1e" opacity=".35" transform="rotate(${it.r*90} ${n(it.x)} ${n(it.z)})"/>`);
    }
    for(const wl of lv.layout.walls){
      const x=Math.min(wl.x1,wl.x2)-(wl.z1===wl.z2?HALF:wl.t/2),z=Math.min(wl.z1,wl.z2)-(wl.x1===wl.x2?HALF:wl.t/2);
      const ww=Math.abs(wl.x2-wl.x1)+(wl.z1===wl.z2?WALL:wl.t),hh=Math.abs(wl.z2-wl.z1)+(wl.x1===wl.x2?WALL:wl.t);
      parts.push(`<rect x="${n(x)}" y="${n(z)}" width="${n(ww)}" height="${n(hh)}" fill="#20252b"/>`);
    }
    return`<svg viewBox="${n(F.x0-pad)} ${n(F.z0-pad)} ${n(w)} ${n(h)}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${parts.join('')}</svg>`;
  }

  return{CATALOG,create,previewSvg};
})();
if(typeof module!=='undefined')module.exports=Templates;
