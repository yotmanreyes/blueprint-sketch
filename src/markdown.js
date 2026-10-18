/* A small, safe Markdown renderer for assistant replies. Everything is escaped first, so the output is plain HTML built only from
   the tags below: headings, paragraphs, lists, tables, quotes, code, bold, italic, strikethrough and http(s) links. */
const Markdown=(()=>{
  const escape=text=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function inline(raw){
    const codes=[];
    let text=String(raw).replace(/`([^`\n]+)`/g,(_,code)=>{codes.push(`<code>${escape(code)}</code>`);return`\u0000${codes.length-1}\u0000`;});
    text=escape(text);
    text=text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,label,url)=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    text=text.replace(/\*\*([^*\n]+?)\*\*/g,'<strong>$1</strong>').replace(/(^|[^\w])__([^_\n]+?)__(?!\w)/g,'$1<strong>$2</strong>');
    text=text.replace(/(^|[^\w*])\*(?![\s*])([^*\n]+?)\*(?![\w*])/g,'$1<em>$2</em>').replace(/(^|[^\w])_(?![\s_])([^_\n]+?)_(?!\w)/g,'$1<em>$2</em>');
    text=text.replace(/~~([^~\n]+?)~~/g,'<del>$1</del>');
    return text.replace(/\u0000(\d+)\u0000/g,(_,i)=>codes[+i]);
  }

  const BULLET=/^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const isTableSeparator=line=>/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)&&line.includes('-');
  const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());

  function list(lines,start){
    const items=[];
    let i=start;
    const baseIndent=BULLET.exec(lines[i])[1].length,ordered=/\d/.test(BULLET.exec(lines[i])[2]);
    while(i<lines.length){
      const m=BULLET.exec(lines[i]);
      if(!m||m[1].length<baseIndent)break;
      if(m[1].length>baseIndent){
        const nested=list(lines,i);
        if(items.length)items[items.length-1].children+=nested.html;
        i=nested.next;continue;
      }
      items.push({text:m[3],children:''});i++;
    }
    const tag=ordered?'ol':'ul';
    return{html:`<${tag}>${items.map(it=>`<li>${inline(it.text)}${it.children}</li>`).join('')}</${tag}>`,next:i};
  }

  function render(source){
    const lines=String(source||'').replace(/\r\n?/g,'\n').split('\n'),out=[];
    let i=0;
    while(i<lines.length){
      const line=lines[i];
      if(!line.trim()){i++;continue;}
      const fence=/^\s*```\s*([\w+-]*)\s*$/.exec(line);
      if(fence){
        const body=[];i++;
        while(i<lines.length&&!/^\s*```\s*$/.test(lines[i]))body.push(lines[i++]);
        i++;
        out.push(`<pre><code>${escape(body.join('\n'))}</code></pre>`);continue;
      }
      const heading=/^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if(heading){out.push(`<h4>${inline(heading[2])}</h4>`);i++;continue;}
      if(/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)){out.push('<hr>');i++;continue;}
      if(/^\s*>/.test(line)){
        const quote=[];
        while(i<lines.length&&/^\s*>/.test(lines[i]))quote.push(lines[i++].replace(/^\s*>\s?/,''));
        out.push(`<blockquote>${render(quote.join('\n'))}</blockquote>`);continue;
      }
      if(line.includes('|')&&i+1<lines.length&&isTableSeparator(lines[i+1])){
        const head=cells(line),rows=[];i+=2;
        while(i<lines.length&&lines[i].trim()&&lines[i].includes('|'))rows.push(cells(lines[i++]));
        out.push(`<div class="mdtable"><table><thead><tr>${head.map(c=>`<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${head.map((_,k)=>`<td>${inline(r[k]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if(BULLET.test(line)){const l=list(lines,i);out.push(l.html);i=l.next;continue;}
      const para=[];
      while(i<lines.length&&lines[i].trim()&&!/^\s*(```|#{1,6}\s|>)/.test(lines[i])&&!BULLET.test(lines[i])&&!/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i]))para.push(lines[i++]);
      if(!para.length){para.push(lines[i++]);}
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    }
    return out.join('');
  }

  return{render,inline,escape};
})();
if(typeof module!=='undefined')module.exports=Markdown;
