/* Interface language. Spanish is the source language: the text written in the code is the lookup key, and a dictionary
   (lang-xx.js) maps it to another language. Text that is missing from a dictionary stays in Spanish.
   Visible text is translated in the DOM (text nodes and a few attributes), so render code does not change; t() is for text that never
   reaches the DOM, such as canvas labels. Keys may hold {name} placeholders. Changing the language reloads the page. */
const I18n=(()=>{
  const STORE='bs-lang',SOURCE='es',NAMES={es:'Español',en:'English'};
  const ATTRS=['title','placeholder','aria-label','alt'];
  const SKIP=new Set(['SCRIPT','STYLE','TEXTAREA','CODE','PRE']);
  const dicts={};
  let lang=SOURCE,observer=null;

  // placeholders named n, max or kb only stand for whole numbers
  const NUMERIC=/^(n|max|kb)$/;
  const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function compile(entries){
    const exact=new Map(),patterns=[];
    for(const[key,value]of Object.entries(entries)){
      exact.set(key,value);
      const names=[...key.matchAll(/\{(\w+)\}/g)].map(m=>m[1]);
      if(!names.length)continue;
      const source=key.split(/\{\w+\}/).reduce((acc,part,i)=>acc+escapeRe(part)+(i<names.length?(NUMERIC.test(names[i])?'(\\d+)':'(.+?)'):''),'');
      patterns.push({re:new RegExp(`^${source}$`),names,to:value,weight:key.replace(/\{\w+\}/g,'').length});
    }
    patterns.sort((a,b)=>b.weight-a.weight);
    return{exact,patterns};
  }
  const fill=(text,params)=>params?text.replace(/\{(\w+)\}/g,(m,k)=>k in params?params[k]:m):text;

  // text as written in the code (with or without values filled in) -> current language
  function translate(text){
    const dict=dicts[lang];
    if(!dict)return text;
    if(dict.exact.has(text))return dict.exact.get(text);
    for(const p of dict.patterns){
      const m=p.re.exec(text);
      if(!m)continue;
      const params={};p.names.forEach((n,i)=>{params[n]=translate(m[i+1]);});
      return fill(p.to,params);
    }
    if(text.includes(' · ')){
      const joined=text.split(' · ').map(translate).join(' · ');
      if(joined!==text)return joined;
    }
    return text;
  }
  function t(text,params){
    const dict=dicts[lang];
    const base=dict&&dict.exact.has(text)?dict.exact.get(text):text;
    return fill(base,params);
  }

  const HAS_LETTERS=/[A-Za-zÁÉÍÓÚáéíóúñÑ]/;
  // Spanish writes decimals with a comma; the other languages use a point
  const localNumbers=text=>lang===SOURCE?text:text.replace(/(\d),(\d{1,2})(?!\d)/g,'$1.$2');
  function translateText(node){
    if(node.parentNode&&SKIP.has(node.parentNode.tagName))return;
    const raw=node.nodeValue,core=raw.trim();
    if(!core||!/[A-Za-zÁÉÍÓÚáéíóúñÑ0-9]/.test(core))return;
    const out=localNumbers(translate(core));
    if(out!==core)node.nodeValue=raw.replace(core,()=>out);
  }
  function translateAttrs(el){
    for(const name of ATTRS){
      const v=el.getAttribute&&el.getAttribute(name);
      if(!v)continue;
      const out=localNumbers(translate(v.trim()));
      if(out!==v.trim())el.setAttribute(name,out);
    }
  }
  function walk(root){
    if(!root)return;
    if(root.nodeType===3){translateText(root);return;}
    if(root.nodeType!==1||root.tagName==='SCRIPT'||root.tagName==='STYLE')return;
    translateAttrs(root);
    if(SKIP.has(root.tagName))return;
    const tree=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
    for(let n=tree.nextNode();n;n=tree.nextNode()){
      if(n.nodeType===1){if(n.tagName!=='SCRIPT'&&n.tagName!=='STYLE')translateAttrs(n);}
      else if(!SKIP.has(n.parentNode.tagName))translateText(n);
    }
  }

  function detect(){
    try{
      const wanted=new URLSearchParams(location.search).get('lang')||localStorage.getItem(STORE);
      if(wanted)return wanted;
    }catch(e){}
    const browser=(navigator.language||SOURCE).slice(0,2).toLowerCase();
    return browser===SOURCE?SOURCE:'en';
  }

  function start(){
    document.documentElement.lang=lang;
    if(lang===SOURCE||!dicts[lang]||!document.body)return;
    walk(document.body);
    observer=new MutationObserver(records=>{
      for(const r of records){
        if(r.type==='childList')r.addedNodes.forEach(walk);
        else if(r.type==='characterData')translateText(r.target);
        else if(r.type==='attributes')translateAttrs(r.target);
      }
    });
    observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTRS});
  }

  return{
    NAMES,
    add(code,entries){dicts[code]=compile(entries);},
    init(){const wanted=detect();lang=dicts[wanted]||wanted===SOURCE?wanted:SOURCE;start();},
    set(code){try{localStorage.setItem(STORE,code);}catch(e){}location.reload();},
    get lang(){return lang;},
    get decimal(){return lang===SOURCE?',':'.';},
    get locale(){return lang;},
    t,translate,
    // the language name the assistant should answer in
    get languageName(){return NAMES[lang]||NAMES[SOURCE];}
  };
})();
if(typeof module!=='undefined')module.exports=I18n;
