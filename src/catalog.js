/* Catalogue of pieces, standard sizes and finishes: data only, shared by the editor, the assistant's tools and the MCP server.
   Measurements are in metres; `w` is the width on the piece's own x axis and `d` its depth. */
const Catalog=(()=>{
  const f2=n=>(+n).toFixed(2).replace('.',',');
  const LIB={
    closet120:{n:'Clóset 1,20',w:1.2,d:.6,zone:'cuarto'}, closet180:{n:'Clóset 1,80',w:1.8,d:.6,zone:'cuarto'}, closet240:{n:'Clóset 2,40',w:2.4,d:.6,zone:'cuarto'},
    cama100:{n:'Cama sencilla',w:1.1,d:2.05,zone:'cuarto'}, cama140:{n:'Cama doble',w:1.5,d:2.05,zone:'cuarto'}, cama160:{n:'Cama queen',w:1.7,d:2.05,zone:'cuarto'},
    mesanoche:{n:'Mesa de noche',w:.45,d:.4,zone:'cuarto'}, escritorio:{n:'Escritorio',w:1.4,d:.6,zone:'cuarto'}, silla:{n:'Silla',w:.45,d:.45,zone:'cuarto'},
    estante:{n:'Estante abierto',w:.8,d:.35,zone:'cuarto'}, repisa:{n:'Repisa flotante',w:1.2,d:.25,elev:1.4,zone:'cuarto'},
    tv:{n:'Mueble TV + TV',w:1.6,d:.4,zone:'cuarto'}, sillon:{n:'Sillón',w:.85,d:.85,zone:'cuarto'}, tapete:{n:'Tapete',w:2.2,d:1.6,zone:'cuarto'},
    planta:{n:'Planta',w:.45,d:.45,zone:'cuarto'}, lampara:{n:'Lámpara de pie',w:.4,d:.4,zone:'cuarto'}, espejo:{n:'Espejo de cuerpo',w:.7,d:.04,elev:.3,zone:'cuarto'},
    banco:{n:'Banco',w:1.1,d:.4,zone:'pasillo'},
    sofa:{n:'Sofá 3 puestos',w:2.1,d:.95,zone:''}, mesa:{n:'Mesa de comedor',w:1.6,d:.9,zone:''}, mesacafe:{n:'Mesa redonda',w:.8,d:.8,zone:''},
    cocina:{n:'Mesón de cocina',w:1.8,d:.6,zone:''}, nevera:{n:'Nevera',w:.7,d:.7,zone:''}, barra:{n:'Barra',w:2.4,d:.6,zone:''},
    arbol:{n:'Árbol',w:1.8,d:1.8,zone:''}, arbusto:{n:'Arbusto',w:.9,d:.9,zone:''}, farola:{n:'Farola',w:.3,d:.3,zone:''},
    bancoparque:{n:'Banca de parque',w:1.7,d:.55,zone:''}, pupitre:{n:'Pupitre',w:.6,d:.8,zone:''}, pizarra:{n:'Pizarra',w:2.4,d:.08,elev:1.0,zone:''},
    caminadora:{n:'Caminadora',w:.9,d:1.8,zone:''}, mancuernas:{n:'Rack de mancuernas',w:1.8,d:.5,zone:''}, auto:{n:'Automóvil',w:1.9,d:4.4,zone:''},
    tumbona:{n:'Tumbona',w:.7,d:1.9,zone:''}, porteria:{n:'Portería',w:3.0,d:.3,zone:''}, canasta:{n:'Aro de baloncesto',w:1.2,d:.8,zone:''},
    columpio:{n:'Columpios',w:2.4,d:1.4,zone:''}, tobogan:{n:'Tobogán',w:.9,d:2.6,zone:''}, mesapicnic:{n:'Mesa de picnic',w:1.8,d:1.6,zone:''}, fuente:{n:'Fuente',w:2.4,d:2.4,zone:''},
    ducha:{n:'Ducha 1,20×0,90',w:1.2,d:.9,zone:'bano'}, sanitario:{n:'Sanitario',w:.4,d:.7,zone:'bano'}, lavamanos:{n:'Lavamanos flotante',w:.6,d:.45,zone:'bano'},
    repisabano:{n:'Repisa de baño',w:.6,d:.15,elev:1.2,zone:'bano'}
  };
  const LIBGROUPS=[['Guardado',['closet120','closet180','closet240','estante','repisa']],['Dormir y trabajar',['cama100','cama140','cama160','mesanoche','escritorio','silla']],
    ['Estar y decoración',['tv','sofa','sillon','tapete','planta','lampara','espejo','banco']],['Cocina y comedor',['cocina','nevera','mesa','mesacafe','barra']],
    ['Baño',['ducha','sanitario','lavamanos','repisabano']],['Exterior',['arbol','arbusto','farola','bancoparque','mesapicnic','fuente','tumbona','auto']],
    ['Juegos y deporte',['columpio','tobogan','porteria','canasta','caminadora','mancuernas']],['Aulas',['pupitre','pizarra']]];
  /* Standard sizes by kind of piece, [name, width, depth] in metres. `w` and `d` bound what can be typed or dragged, so a piece
     never becomes absurd; pieces that are not listed (fixtures, chairs, vehicles) keep their size. `uniform` scales all three axes. */
  const STD={
    cama:{sizes:[['Sencilla',1.1,2.05],['Semidoble',1.3,2.05],['Doble',1.5,2.05],['Queen',1.7,2.05],['King',2.0,2.15]],w:[.9,2.2],d:[1.9,2.3]},
    closet:{sizes:[.6,.9,1.2,1.5,1.8,2.1,2.4,3.0].map(w=>[`${f2(w)} m`,w,.6]),w:[.5,3.6],d:[.4,.7]},
    mesanoche:{sizes:[['Pequeña',.4,.35],['Estándar',.45,.4],['Amplia',.55,.45]],w:[.3,.7],d:[.3,.5]},
    escritorio:{sizes:[['Compacto',1.0,.55],['Estándar',1.4,.6],['Amplio',1.6,.7],['Doble',1.8,.75]],w:[.9,2.2],d:[.5,.9]},
    mesa:{sizes:[['4 puestos',1.2,.8],['6 puestos',1.6,.9],['8 puestos',2.0,1.0],['10 puestos',2.4,1.0]],w:[1.0,3.0],d:[.7,1.2]},
    mesacafe:{uniform:true,sizes:[.6,.7,.8,.9,1.0].map(w=>[`Ø ${f2(w)} m`,w,w]),w:[.5,1.2],d:[.5,1.2]},
    sofa:{sizes:[['2 puestos',1.6,.9],['3 puestos',2.1,.95],['4 puestos',2.6,1.0]],w:[1.4,3.0],d:[.8,1.1]},
    sillon:{sizes:[['Individual',.85,.85],['Grande',1.0,.95]],w:[.7,1.2],d:[.7,1.1]},
    tv:{sizes:[1.2,1.6,2.0,2.4].map(w=>[`${f2(w)} m`,w,.4]),w:[1.0,3.0],d:[.3,.5]},
    estante:{sizes:[['Angosto',.6,.3],['Estándar',.8,.35],['Ancho',1.0,.35],['Amplio',1.2,.4]],w:[.5,1.6],d:[.25,.5]},
    repisa:{sizes:[.6,.9,1.2,1.5].map(w=>[`${f2(w)} m`,w,.25]),w:[.4,2.0],d:[.15,.35]},
    repisabano:{sizes:[.4,.6,.8,1.0].map(w=>[`${f2(w)} m`,w,.15]),w:[.3,1.2],d:[.1,.25]},
    tapete:{sizes:[['Pequeño',1.6,1.1],['Mediano',2.2,1.6],['Grande',2.6,1.9],['Extra grande',3.0,2.0]],w:[1.0,4.0],d:[.7,3.0]},
    banco:{sizes:[['Corto',.9,.4],['Estándar',1.1,.4],['Largo',1.5,.45]],w:[.7,2.0],d:[.3,.5]},
    cocina:{sizes:[1.2,1.5,1.8,2.1,2.4].map(w=>[`${f2(w)} m`,w,.6]),w:[.9,3.0],d:[.55,.75]},
    nevera:{sizes:[['Compacta',.6,.65],['Estándar',.7,.7],['Grande',.9,.75]],w:[.5,1.0],d:[.55,.8]},
    barra:{sizes:[1.8,2.4,3.0,3.6].map(w=>[`${f2(w)} m`,w,.6]),w:[1.2,4.5],d:[.5,.8]},
    ducha:{sizes:[['Compacta',.8,.8],['Estándar',.9,.9],['Amplia',1.2,.9],['Grande',1.5,.9]],w:[.7,1.8],d:[.7,1.2]},
    lavamanos:{sizes:[['Pequeño',.45,.4],['Estándar',.6,.45],['Ancho',.8,.5],['Doble',1.2,.5]],w:[.4,1.4],d:[.35,.6]},
    bancoparque:{sizes:[1.2,1.5,1.7,2.0].map(w=>[`${f2(w)} m`,w,.55]),w:[1.0,2.4],d:[.45,.7]},
    mesapicnic:{sizes:[['Pequeña',1.5,1.4],['Estándar',1.8,1.6],['Grande',2.2,1.8]],w:[1.2,2.6],d:[1.2,2.2]},
    pizarra:{sizes:[1.2,1.8,2.4,3.0].map(w=>[`${f2(w)} m`,w,.08]),w:[1.0,4.0],d:[.06,.12]},
    planta:{uniform:true,sizes:[['Pequeña',.35,.35],['Mediana',.45,.45],['Grande',.7,.7]],w:[.3,.9],d:[.3,.9]},
    arbusto:{uniform:true,sizes:[.6,.9,1.3].map(w=>[`${f2(w)} m`,w,w]),w:[.5,1.6],d:[.5,1.6]},
    arbol:{uniform:true,sizes:[['Joven',1.2,1.2],['Mediano',1.8,1.8],['Grande',2.6,2.6],['Frondoso',3.4,3.4]],w:[1.0,4.0],d:[1.0,4.0]},
    fuente:{uniform:true,sizes:[['Pequeña',1.6,1.6],['Mediana',2.4,2.4],['Grande',3.2,3.2]],w:[1.4,4.0],d:[1.4,4.0]}
  };
  const STD_OF={cama100:'cama',cama140:'cama',cama160:'cama',closet120:'closet',closet180:'closet',closet240:'closet'};
  const stdOf=type=>STD[STD_OF[type]||type];
  const FLOORS=[['marmol_blanco','Mármol blanco 60×120',false],['marmol_negro','Mármol negro 60×120',false],['cemento','Tipo cemento 60×60',false],
    ['madera','Tipo madera 20×120',false],['terrazo','Terrazo 60×60',false],['gris_claro','Gris claro 60×60',false],
    ['cesped','Césped',true],['adoquin','Adoquín',true],['arena','Arena',true],['agua','Agua',true],['cancha','Cancha',true],['pavimento','Pavimento',true]];
  const WALL_FINISHES=[['pintura','Pintura'],['micro','Microcemento'],['ladrillo','Ladrillo'],['enchape-grande','Enchape 60×120'],['enchape-metro','Enchape metro'],['madera','Listones de madera']];
  const STYLES=[['ind_concreto','Industrial concreto'],['ind_ladrillo','Industrial ladrillo'],['moderno','Moderno minimal'],['calido','Cálido con madera'],['nordico','Nórdico']];
  return{LIB,LIBGROUPS,STD,STD_OF,stdOf,FLOORS,WALL_FINISHES,STYLES};
})();
if(typeof module!=='undefined')module.exports=Catalog;
