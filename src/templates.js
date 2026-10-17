/* Ready-made plans to start from: houses, buildings, a park. Each builder draws with the same walls,
   floors, openings, stairs and pieces a person would, so the result is an ordinary plan. */
const Templates=(()=>{
  const WALL=.15,HALF=WALL/2;
  const SIDES={n:{r:0},w:{r:1},s:{r:2},e:{r:3}};

  // every call is in the plan's own coordinates; `mirror` flips the x axis around a vertical line for twin apartments
  function context(state,lib){
    let mirror=null;
    const next=prefix=>prefix+(++state.n);
    const fx=x=>mirror===null?x:mirror-x;
    const L=()=>state.layout;
    const place=(kind,x,z,w,h,sill,width)=>{
      const near=Layout.nearestWall(L(),fx(x),z,.4);
      if(!near)throw new Error(`no wall for the ${kind} at ${x},${z}`);
      const o={id:next('o'),wall:near.wall.id,pos:0,w:width||w,h,sill,kind};
      o.pos=near.at-o.w/2;
      if(!Layout.fitOpening(L(),o,Levels.WALL_HEIGHT)||Layout.overlaps(L(),o))throw new Error(`the ${kind} at ${x},${z} does not fit`);
      L().openings.push(o);
    };
    const api={
      mirrored(about,build){mirror=about;try{build();}finally{mirror=null;}},
      wall(x1,z1,x2,z2,t=WALL){
        const id=next('w');
        L().walls.push(Layout.normalize({id,x1:fx(x1),z1,x2:fx(x2),z2,t,faces:{lo:id+'a',hi:id+'b'}}));
      },
      perimeter(x0,z0,x1,z1){api.wall(x0,z0,x1,z0);api.wall(x0,z1,x1,z1);api.wall(x0,z0,x0,z1);api.wall(x1,z0,x1,z1);},
      floor(x0,z0,x1,z1,name,f='marmol_blanco'){
        const a=fx(x0),b=fx(x1),lo=Math.min(a,b),hi=Math.max(a,b);
        L().floors.push({id:next('f'),x:(lo+hi)/2,z:(z0+z1)/2,w:hi-lo,d:z1-z0,f,name,zone:''});
      },
      door(x,z,{w=.9,h=2.1}={}){place('door',x,z,w,h,0,w);},
      window(x,z,{w=1.2,h=1.2,sill=.9}={}){place('window',x,z,w,h,sill,w);},
      stair(x,z,w,d,r){L().stairs.push({id:next('st'),x:fx(x),z,w,d,r:mirror!==null&&r%2?(r+2)%4:r});},
      item(t,x,z,r=0){
        if(!lib[t])throw new Error('unknown piece '+t);
        state.items.push({id:next('i'),t,x:fx(x),z,r:mirror!==null&&r%2?(r+2)%4:r});
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
      rename(name){state.levels[state.level].name=name;}
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

  const CATALOG=[
    {key:'blank',name:'En blanco',category:'Para empezar',description:'Una cuadrícula vacía para dibujar desde cero.'},
    {key:'studio',name:'Apartaestudio',category:'Vivienda',description:'Un solo ambiente con cocina abierta y baño. 35 m².',build:studio},
    {key:'house',name:'Casa de un nivel',category:'Vivienda',description:'Sala, comedor y cocina abiertos, dos dormitorios y un baño. 80 m².',build:house},
    {key:'house2',name:'Casa de dos niveles',category:'Vivienda',description:'Zona social abajo, tres dormitorios, estudio y baño arriba, con escalera. 126 m².',build:twoStoryHouse,levels:2},
    {key:'building',name:'Edificio de apartamentos',category:'Edificios',description:'Locales y lobby abajo y tres pisos con dos apartamentos cada uno, con escalera.',build:building,levels:4},
    {key:'office',name:'Oficina',category:'Edificios',description:'Recepción, sala de reuniones, baños y oficina abierta con puestos. 96 m².',build:office},
    {key:'cafe',name:'Cafetería',category:'Edificios',description:'Salón con barra y mesas, cocina y baño. 80 m².',build:cafe},
    {key:'park',name:'Parque',category:'Espacios abiertos',description:'Plaza con fuente, caminos, zona de juegos, estanque, kiosco, árboles y bancas. 30 × 24 m.',build:park},
    {key:'example',name:'Casa de ejemplo',category:'Vivienda',description:'Dormitorio, pasillo y baño, con vistas fijas para recorrerlos.'}
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
    cesped:'#4c7a3e',adoquin:'#a39a8d',arena:'#d9c79a',agua:'#3f86a8',pavimento:'#5b5d60'};
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
