const ICON_PATHS={
  closet:'<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M9.5 11v2M14.5 11v2"/>',
  estante:'<path d="M5 3v18M19 3v18M5 8h14M5 14h14M5 20h14M8 8V5M10.5 8V4.5M15 14v-4"/>',
  repisa:'<path d="M3 14h18M6 14v3M18 14v3M8 14v-3h4v3M15 14V9h2v5"/>',
  cama:'<path d="M3 19v-9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9M3 15h18M3 19v-2M21 19v-2"/><rect x="6" y="10" width="5" height="3" rx="1"/><rect x="13" y="10" width="5" height="3" rx="1"/>',
  mesanoche:'<rect x="6" y="9" width="12" height="11"/><path d="M6 14h12M10 17h4M12 4v5M9.5 4h5"/>',
  escritorio:'<path d="M3 11h18M5 11v9M19 11v9"/><rect x="8" y="3" width="8" height="5" rx=".5"/><path d="M12 8v3"/>',
  silla:'<path d="M8 3v9M7 12h10M8 12v8M16 12v8"/>',
  tv:'<rect x="3" y="4" width="18" height="11" rx="1"/><path d="M8 19h8M12 15v4"/>',
  sillon:'<path d="M6 10V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><path d="M4 12a2 2 0 0 1 4 0v3h8v-3a2 2 0 0 1 4 0v5H4z"/><path d="M6 17v2M18 17v2"/>',
  tapete:'<rect x="3" y="7" width="18" height="10" rx="1"/><rect x="6" y="10" width="12" height="4"/><path d="M3 9H2M3 12H2M3 15H2M21 9h1M21 12h1M21 15h1"/>',
  planta:'<path d="M8 21l-1-6h10l-1 6z"/><path d="M12 15V8M12 11c-3 0-5-2-5-5 3 0 5 2 5 5zM12 9c0-3 2-5 5-5 0 3-2 5-5 5z"/>',
  lampara:'<path d="M8 4h8l2 6H6zM12 10v10M8 20h8"/>',
  espejo:'<rect x="7" y="3" width="10" height="18" rx="1"/><path d="M10 8l3-2M10 13l5-5"/>',
  banco:'<path d="M3 11h18v3H3zM5 14v6M19 14v6M8 4v4M12 4v4M16 4v4"/>',
  ducha:'<path d="M5 21V3h6"/><path d="M8 8a5 5 0 0 1 10 0z"/><path d="M10 11v2M13 11v3M16 11v2M11.5 17v2M14.5 18v2"/>',
  sanitario:'<path d="M7 3h10v5H7zM6 8h12M8 9c0 4 1 6 4 6s4-2 4-6M9 15l-1 5h8l-1-5"/>',
  lavamanos:'<path d="M3 11h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM12 4v7M12 4h3"/>',
  repisabano:'<path d="M3 13h18M6 13v3M18 13v3M8 13V6h8v7M8 9h8"/>'
};
const ICON_OF={closet120:'closet',closet180:'closet',closet240:'closet',cama100:'cama',cama140:'cama',cama160:'cama'};

function iconSvg(key){
  const p=ICON_PATHS[ICON_OF[key]||key];
  return p?`<svg class="ic" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`:'';
}
