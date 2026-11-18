const {test}=require('node:test');
const assert=require('node:assert/strict');
const {unzipSync,strFromU8}=require('fflate');
const XLSX=require('@e965/xlsx');
const {creativeIntent,widgetLayout,widgetField,documentContent,documentBytes}=require('../creative-tools.cjs');
const {PersonalMemory,interval}=require('../personal-memory.cjs');
const {avatarIntent}=require('../avatar-intent.cjs');
const {authorizationCode,Accounts,googleServices}=require('../accounts.cjs');

test('widget edits keep checklist items, IDs and removed field values',()=>{
  assert.equal(creativeIntent('Мира, сделай виджет разработки игры').kind,'widget');
  assert.equal(creativeIntent('Подготовь презентацию о проекте').format,'pptx');
  assert.equal(creativeIntent('Сделай таблицу затрат').format,'xlsx');
  const ref={kind:'widget',id:'current'};
  assert.equal(creativeIntent('Убери процент и сделай компактнее',ref).id,'current');
  assert.equal(creativeIntent('Добавь задачу купить молоко',ref),null);
  const first=widgetLayout({title:'Игра',blocks:[{type:'checklist',label:'Задачи',items:['Меню']},{type:'progress',label:'Готовность',value:41}]});
  widgetField(first,first.blocks[0].id,{toggle:first.blocks[0].value[0].id});
  const revised=widgetLayout({title:'Игра',compact:true,blocks:[{type:'checklist',label:'Список',items:[]},{type:'date',label:'Тест'}]},first);
  assert.deepEqual(revised.blocks[0].value,first.blocks[0].value);
  assert.equal(revised.blocks[0].value[0].done,true);
  assert.equal(revised.hidden[0].value,41);
  assert.equal(widgetLayout({title:'Игра',blocks:[{type:'progress'}]},revised).blocks[0].value,41);
});

test('Office exports are independent files and treat generated strings as data',()=>{
  for (const format of ['docx','xlsx','pptx']) {
    const input={title:'Игра & отчёт',rows:[['Название','Значение'],['=2+2',14]],sections:[{heading:'Этап',lines:['А < Б','Релиз']}]};
    const bytes=documentBytes({...documentContent(format,input),format});
    const files=unzipSync(bytes);
    assert.ok(files['[Content_Types].xml']);
    if (format==='xlsx') {
      const wb=XLSX.read(bytes);
      assert.equal(wb.Sheets.Мира.A2.v,'=2+2');
      assert.equal(wb.Sheets.Мира.A2.f,undefined);
      assert.equal(wb.Sheets.Мира.B2.v,14);
    } else {
      const part=format==='docx'?'word/document.xml':'ppt/slides/slide2.xml';
      assert.ok(strFromU8(files[part]).includes('А &lt; Б'));
    }
  }
});

test('meaning markers can arrive in fragments without leaking into chat',()=>{
  const moods=[],texts=[];
  const a=avatarIntent(x=>moods.push(x),x=>texts.push(x));
  a.stream('[[mi');
  a.stream('[[mira:ca');
  a.stream('[[mira:care]]\nЧ');
  a.stream('[[mira:care]]\nЧем помочь?');
  assert.deepEqual(moods,['care']);
  assert.deepEqual(texts,['Ч','Чем помочь?']);
  assert.equal(a.finish('Ответ без метки'),'Ответ без метки');
  assert.equal(a.finish('[[mira:unknown]]\nОтвет'),'Ответ');
});

test('memory waits 48 hours, batches across chats, preserves style and picks up new turns',async()=>{
  const calls=[];
  let now=10;
  const message=(id,text)=>({id,text,role:'user',time:now});
  const data={chats:[{id:'c1',messages:[message('1','Подробно')]},{id:'c2',messages:[message('2','Предпочитаю научный стиль')]}],
    settings:{personalMemory:true,personalMemorySince:now}};
  const m=new PersonalMemory(data,()=>{},async(previous,turns)=>{
    calls.push(turns);
    return {summary:(previous.summary||'')+' '+turns.map(x=>x.text).join(' '),style:'Подробно и научно'};
  },()=>now);
  assert.equal(await m.run(),false);
  now+=interval;
  assert.equal(await m.run(),true);
  assert.equal(calls[0].length,2);
  assert.match(m.context(),/Подробно и научно/);
  assert.equal(m.context(true),'');
  data.settings.personalStyle='Кратко';
  assert.match(m.context(),/Кратко/);
  data.chats[0].messages.push(message('3','Новое'));
  now+=interval;
  await m.run();
  assert.deepEqual(calls[1].map(x=>x.text),['Новое']);
  m.clear();
  assert.equal(m.status().summary,'');
  await m.run(true);
  assert.equal(calls.length,2);
});

test('Google OAuth callback validates state, binds to loopback and uses PKCE',async()=>{
  const {createHash}=require('node:crypto');
  let request;
  const result=await authorizationCode('google',{clientId:'mira-fixture.apps.googleusercontent.com',services:['drive']},async address=>{
    request=new URL(address);
    const redirect=new URL(request.searchParams.get('redirect_uri'));
    assert.equal(redirect.hostname,'127.0.0.1');
    assert.match(request.searchParams.get('scope'),/drive\.readonly/);
    redirect.searchParams.set('code','code-fixture');
    redirect.searchParams.set('state','wrong');
    assert.equal((await fetch(redirect)).status,404);
    redirect.searchParams.set('state',request.searchParams.get('state'));
    assert.equal((await fetch(redirect)).status,200);
  },AbortSignal.timeout(5000));
  assert.equal(result.code,'code-fixture');
  assert.equal(createHash('sha256').update(result.code_verifier).digest('base64url'),request.searchParams.get('code_challenge'));
});

test('connected Google account lists data using the granted service only',async()=>{
  const requested=[];
  const credentials={services:['drive'],access:'testing-token'};
  const client=new Accounts({data:{google:{label:'Test'}},read:()=>JSON.stringify(credentials),save(){},open(){},
    fetcher:async(address,options)=>{
      requested.push([String(address),options.headers.Authorization]);
      return Response.json({files:[{id:'abc',name:'Roadmap',description:'January'}]});
    }});
  assert.equal((await client.list('drive'))[0].title,'Roadmap');
  assert.equal(requested[0][1],'Bearer testing-token');
  assert.ok(requested[0][0].startsWith('https://www.googleapis.com/drive/v3/files?'));
  assert.match(googleServices.gmail,/readonly/);
  await assert.rejects(()=>client.list('gmail'),/разрешением/);
});
