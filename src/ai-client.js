/* Talks to a language model that can call tools: OpenAI, Anthropic (Claude), Google Gemini, or anything that speaks the
   OpenAI chat format. Requests go straight from the browser to the provider with the person's own key; nothing passes through
   this site. The conversation is kept in one neutral shape and turned into each provider's format on every request:
     {role:'user', text}
     {role:'assistant', text, calls:[{id,name,args}], raw}
     {role:'tool', results:[{id,name,content,isError}]} */
const AiClient=(()=>{
  const MAX_STEPS=16,MAX_RESULT_CHARS=20000;
  const PROVIDERS={
    openai:{name:'OpenAI',base:'https://api.openai.com/v1',model:'gpt-4.1',needsBase:false},
    anthropic:{name:'Anthropic (Claude)',base:'https://api.anthropic.com',model:'claude-sonnet-5-5',needsBase:false},
    gemini:{name:'Google Gemini',base:'https://generativelanguage.googleapis.com',model:'gemini-2.5-flash',needsBase:false},
    compatible:{name:'Compatible con OpenAI (URL propia)',base:'http://localhost:11434/v1',model:'',needsBase:true}
  };

  class AiError extends Error{constructor(status,message){super(message);this.status=status;}}

  const parseArgs=raw=>{
    if(raw&&typeof raw==='object')return raw;
    try{return raw?JSON.parse(raw):{};}catch(e){return{};}
  };

  /* ---------- OpenAI chat completions ---------- */
  const openai={
    request({system,tools,transcript,model,apiKey,baseUrl}){
      const messages=[{role:'system',content:system}];
      for(const m of transcript){
        if(m.role==='user')messages.push({role:'user',content:m.text});
        else if(m.role==='assistant')messages.push({role:'assistant',content:m.text||null,...(m.calls.length?{tool_calls:m.calls.map(c=>({id:c.id,type:'function',function:{name:c.name,arguments:JSON.stringify(c.args)}}))}:{})});
        else for(const r of m.results)messages.push({role:'tool',tool_call_id:r.id,content:r.content});
      }
      return{url:`${baseUrl.replace(/\/$/,'')}/chat/completions`,headers:{'content-type':'application/json',...(apiKey?{authorization:`Bearer ${apiKey}`}:{})},
        body:{model,messages,tools:tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}})),tool_choice:'auto'}};
    },
    parse(json){
      const message=json.choices&&json.choices[0]&&json.choices[0].message;
      if(!message)throw new AiError(0,'the answer had no message');
      return{text:message.content||'',calls:(message.tool_calls||[]).map(c=>({id:c.id,name:c.function.name,args:parseArgs(c.function.arguments)}))};
    }
  };

  /* ---------- Anthropic messages ---------- */
  const anthropic={
    request({system,tools,transcript,model,apiKey,baseUrl}){
      const messages=[];
      for(const m of transcript){
        if(m.role==='user')messages.push({role:'user',content:m.text});
        else if(m.role==='assistant')messages.push({role:'assistant',content:[...(m.text?[{type:'text',text:m.text}]:[]),...m.calls.map(c=>({type:'tool_use',id:c.id,name:c.name,input:c.args}))]});
        else messages.push({role:'user',content:m.results.map(r=>({type:'tool_result',tool_use_id:r.id,content:r.content,...(r.isError?{is_error:true}:{})}))});
      }
      return{url:`${baseUrl.replace(/\/$/,'')}/v1/messages`,
        headers:{'content-type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:{model,max_tokens:4096,system,messages,tools:tools.map(t=>({name:t.name,description:t.description,input_schema:t.parameters}))}};
    },
    parse(json){
      if(!Array.isArray(json.content))throw new AiError(0,'the answer had no content');
      return{text:json.content.filter(b=>b.type==='text').map(b=>b.text).join('\n'),
        calls:json.content.filter(b=>b.type==='tool_use').map(b=>({id:b.id,name:b.name,args:b.input||{}}))};
    }
  };

  /* ---------- Google Gemini ---------- */
  // Gemini takes a subset of JSON Schema with upper-case types and rejects an object without properties
  function geminiSchema(schema){
    if(!schema||typeof schema!=='object')return schema;
    const out={type:String(schema.type||'string').toUpperCase()};
    if(schema.description)out.description=schema.description;
    if(schema.enum)out.enum=schema.enum;
    if(schema.properties){out.properties=Object.fromEntries(Object.entries(schema.properties).map(([k,v])=>[k,geminiSchema(v)]));if(schema.required&&schema.required.length)out.required=schema.required;}
    return out;
  }
  const gemini={
    request({system,tools,transcript,model,apiKey,baseUrl}){
      const contents=[];
      for(const m of transcript){
        if(m.role==='user')contents.push({role:'user',parts:[{text:m.text}]});
        else if(m.role==='assistant')contents.push({role:'model',parts:m.raw&&m.raw.parts?m.raw.parts:[...(m.text?[{text:m.text}]:[]),...m.calls.map(c=>({functionCall:{name:c.name,args:c.args}}))]});
        else contents.push({role:'user',parts:m.results.map(r=>({functionResponse:{name:r.name,response:{result:r.content}}}))});
      }
      const declarations=tools.map(t=>({name:t.name,description:t.description,...(t.parameters&&t.parameters.properties&&Object.keys(t.parameters.properties).length?{parameters:geminiSchema(t.parameters)}:{})}));
      return{url:`${baseUrl.replace(/\/$/,'')}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        headers:{'content-type':'application/json','x-goog-api-key':apiKey},
        body:{systemInstruction:{parts:[{text:system}]},contents,tools:[{functionDeclarations:declarations}]}};
    },
    parse(json){
      const content=json.candidates&&json.candidates[0]&&json.candidates[0].content;
      if(!content||!Array.isArray(content.parts))throw new AiError(0,json.promptFeedback&&json.promptFeedback.blockReason?`blocked: ${json.promptFeedback.blockReason}`:'the answer had no content');
      const calls=content.parts.filter(p=>p.functionCall).map((p,i)=>({id:`${p.functionCall.name}-${i}`,name:p.functionCall.name,args:p.functionCall.args||{}}));
      return{text:content.parts.filter(p=>typeof p.text==='string'&&!p.thought).map(p=>p.text).join(''),calls,raw:content};
    }
  };

  const ADAPTERS={openai,compatible:openai,anthropic,gemini};

  async function failure(response){
    let message=`error ${response.status}`;
    try{
      const body=await response.json(),detail=body.error&&(body.error.message||body.error)||body.message;
      if(detail)message=typeof detail==='string'?detail:JSON.stringify(detail);
    }catch(e){}
    return new AiError(response.status,message);
  }

  const clip=text=>text.length>MAX_RESULT_CHARS?text.slice(0,MAX_RESULT_CHARS)+'… (cut)':text;

  // one conversation turn: the model may call tools several times before it answers
  async function run({provider,apiKey,model,baseUrl,system,tools,transcript,execute,onEvent=()=>{},signal,maxSteps=MAX_STEPS,fetchImpl=globalThis.fetch}){
    const adapter=ADAPTERS[provider],info=PROVIDERS[provider];
    if(!adapter)throw new AiError(0,`unknown provider "${provider}"`);
    if(!model)throw new AiError(0,'choose a model');
    if(!apiKey&&provider!=='compatible')throw new AiError(0,'enter your API key');
    const base=baseUrl||info.base;
    for(let step=1;step<=maxSteps;step++){
      if(signal&&signal.aborted)return{stopped:'aborted',steps:step-1};
      const{url,headers,body}=adapter.request({system,tools,transcript,model,apiKey,baseUrl:base});
      let response;
      try{response=await fetchImpl(url,{method:'POST',headers,body:JSON.stringify(body),signal});}
      catch(e){
        if(signal&&signal.aborted)return{stopped:'aborted',steps:step-1};
        throw new AiError(0,`could not reach ${new URL(url).host}: ${e.message}`);
      }
      if(!response.ok)throw await failure(response);
      const parsed=adapter.parse(await response.json());
      transcript.push({role:'assistant',text:parsed.text,calls:parsed.calls,raw:parsed.raw});
      if(parsed.text)onEvent({type:'text',text:parsed.text});
      if(!parsed.calls.length)return{stopped:'done',steps:step};
      const results=[];
      for(const call of parsed.calls){
        if(signal&&signal.aborted){results.push({id:call.id,name:call.name,content:'cancelled by the person',isError:true});continue;}
        onEvent({type:'call',name:call.name,args:call.args});
        const out=await execute(call.name,call.args);
        results.push({id:call.id,name:call.name,content:clip(JSON.stringify(out.ok?out.result:{error:out.error})),isError:!out.ok});
        onEvent({type:'result',name:call.name,ok:out.ok,summary:out.ok?undefined:out.error});
      }
      transcript.push({role:'tool',results});
    }
    return{stopped:'max-steps',steps:maxSteps};
  }

  return{PROVIDERS,AiError,run,adapters:ADAPTERS,geminiSchema};
})();
if(typeof module!=='undefined')module.exports=AiClient;
