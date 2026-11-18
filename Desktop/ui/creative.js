import {$,esc,call,field,select,toast,reportError} from './shared.js';

const action=(text,op,id='')=>'<button type="button" class="btn" data-creative="'+op+'" data-id="'+esc(id)+'">'+esc(text)+'</button>';
const formats={docx:'Документ Word',xlsx:'Таблица Excel',pptx:'Презентация PowerPoint'};
const labels={google:'Google',github:'GitHub',yandex:'Яндекс ID'};
const services={drive:'Google Drive',calendar:'Google Calendar',gmail:'Gmail',github:'Репозитории GitHub'};

export function widgetBlocks(widget,projects,edit,screen=false) {
  return '<div class="creativeBlocks">'+widget.blocks.map(block=>{
    const content=block.type==='checklist'
      ? '<ul>'+block.value.map(row=>'<li>'+(edit?'<label><input type="checkbox" data-creative-field="'+esc(block.id)+'" data-task="'+esc(row.id)+'" '+(row.done?'checked':'')+'> '+esc(row.text)+'</label>':
        (screen?'<button type="button" data-screen-task="'+esc(row.id)+'" data-screen-block="'+esc(block.id)+'" aria-pressed="'+row.done+'">'+
          (row.done?'✓ ':'○ ')+esc(row.text)+'</button>':(row.done?'✓ ':'○ ')+esc(row.text)))+'</li>').join('')+'</ul>'+
        (edit?'<form data-add-widget="'+esc(block.id)+'"><input class="control" maxlength="160" aria-label="Новая задача" required><button class="btn">Добавить задачу</button></form>':'')
      : block.type==='progress'
        ? '<progress max="100" value="'+esc(block.value)+'"></progress> '+esc(block.value)+'%'+(edit?'<input class="control" aria-label="'+esc(block.label)+'" type="number" min="0" max="100" data-creative-field="'+esc(block.id)+'" value="'+esc(block.value)+'">':'')
        : block.type==='date'
          ? (edit?'<input class="control" data-creative-field="'+esc(block.id)+'" aria-label="'+esc(block.label)+'" type="date" value="'+esc(block.value)+'">':esc(block.value)||'—')
          : block.type==='project'
            ? (edit?select('Рабочая папка','creativeProject',[['','Выбрать проект'],...projects.filter(p=>p.folder).map(p=>[p.id,p.name])],widget.projectId)+
              action(block.label,'openWidgetProject',widget.id):
              '<button type="button" data-act="openWidgetProject" data-id="'+esc(widget.id)+'" class="btn">'+esc(block.label)+'</button>')
            : edit?'<textarea class="control" data-creative-field="'+esc(block.id)+'" aria-label="'+esc(block.label)+'" maxlength="1500">'+esc(block.value)+'</textarea>':esc(block.value);
    return '<div class="creativeBlock">'+(block.type==='project'?'':'<strong>'+esc(block.label)+'</strong>')+content+'</div>';
  }).join('')+'</div>';
}

function documentPreview(doc) {
  if (doc.format==='xlsx') {
    const [head,...rows]=doc.rows;
    return '<div class="creativeTable"><table><thead><tr>'+head.map(cell=>'<th>'+esc(cell)+'</th>').join('')+'</tr></thead><tbody>'+
      rows.map(row=>'<tr>'+row.map(cell=>'<td>'+esc(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  }
  const sections=doc.sections.map(section=>'<section><h3>'+esc(section.heading)+'</h3>'+
    (doc.format==='pptx'?'<ul>'+section.lines.map(line=>'<li>'+esc(line)+'</li>').join('')+'</ul>':
      section.lines.map(line=>'<p>'+esc(line)+'</p>').join(''))+'</section>').join('');
  return '<div class="creativePreview '+(doc.format==='pptx'?'creativeSlides':'')+'"><h2>'+esc(doc.title)+'</h2>'+sections+'</div>';
}

export function creativeUI(modal,close,state,send,saveSettings,openMail,attach) {
  const host=$('#modalBody');
  let active, accounts=[], service, result=[], notice='', memory;
  let updateLoop, accountDraft={}, selection;
  function stopLoop() {clearInterval(updateLoop);updateLoop=undefined;}
  $('#modal').addEventListener('close',stopLoop);
  function pendingRows() {
    const element=$('#accountPending');
    if (!element) return;
    element.innerHTML=accounts.filter(row=>row.pending).map(row=>'<div role="status"><strong>'+esc(labels[row.provider])+'</strong> · '+
      (row.pending.code?'Код для ввода в браузере <code>'+esc(row.pending.code)+'</code>':'Заверши вход в браузере')+
      action('Отменить','cancelAccount',row.provider)+'</div>').join('');
  }
  async function connect() {
    active={kind:'accounts'};
    selection=undefined;
    accounts=await call('accountStatus');
    drawAccounts();
  }
  function drawAccounts() {
    stopLoop();
    const provider=accountDraft.provider||'google';
    modal('Подключённые аккаунты',
      '<div class="creativeAccounts">'+accounts.map(row=>'<article class="box"><strong>'+esc(labels[row.provider])+'</strong>'+
        (row.connected?'<p>'+esc(row.label)+(row.sessionOnly?' · до закрытия Миры':'')+'</p>'+action('Отключить','disconnectAccount',row.provider)+
          (row.provider==='github'?action(services.github,'listAccount','github'):
            (row.services||[]).map(name=>action(services[name],'listAccount',name)).join('')):'')+'</article>').join('')+
      '<article class="box"><h3>Новое подключение</h3>'+
      select('Сервис','creativeProvider',Object.entries(labels),provider)+
      field('OAuth Client ID','creativeClientId',accountDraft.clientId||'')+
      (provider==='github'?'<p>В настройках приложения GitHub включи Device Flow.</p>':
        field('OAuth Client Secret','creativeSecret','','password')+
        (provider==='google'?'<p>Создай клиент OAuth типа «Приложение для ПК» и включи нужные API в Google Cloud.</p>'+
          ['drive','calendar','gmail'].map(name=>'<label><input type="checkbox" data-creative-service="'+name+'" '+(accountDraft.services?.includes(name)?'checked':'')+'> '+services[name]+'</label>').join(''):
          '<p>В настройках приложения Яндекс ID добавь адрес <code>http://127.0.0.1:43821/oauth/callback</code> и доступ к профилю и почте.</p>'))+
      action('Войти в браузере','beginAccount')+'<section id="accountPending"></section></article>'+
      '<article class="box"><h3>Почтовые ящики</h3><p>Яндекс Почту и Gmail можно подключить в почтовом виджете с паролем приложения для чтения и отправки.</p>'+
      action('Открыть почтовые ящики','openMail')+'</article></div>'+
      (notice?'<p role="status">'+esc(notice)+'</p>':'')+
      (service?'<section><h3>'+esc(services[service])+'</h3>'+
        (result.length?result.map(row=>'<article class="creativeServiceRow"><strong>'+esc(row.title)+'</strong><p>'+esc(row.detail)+'</p>'+
          (row.preview?action('Предпросмотр','previewAccountItem',row.id):'')+
          '<a href="'+esc(row.link)+'" data-creative="openService" data-id="'+esc(row.link)+'">Открыть в браузере</a></article>').join(''):'<p>Нет записей.</p>')+'</section>':''));
    pendingRows();
  }
  async function view(ref) {
    active=ref;
    const data=await call('creativeGet',ref);
    if (active!==ref) return;
    const placement=state().screenWidgets?.[data.id];
    const current=placement ? placement.wallpaper?'wallpaper':placement.pin?'pin':'window' : 'off';
    modal(data.title,
      (ref.kind==='widget'?widgetBlocks(data,state().projects||[],true)+
        select('Размещение виджета','creativeWidgetPlacement',[['off','Внутри Миры'],['window','На экране ПК'],['pin','Поверх окон'],
          ...(state().platform==='win32'?[['wallpaper','На слое обоев']]:[])],current):
        '<p>'+esc(formats[data.format])+'</p>'+documentPreview(data)+action('Сохранить '+data.format.toUpperCase(),'saveDocument',data.id))+
      '<form id="creativeRevision" class="creativeRevision"><label class="field">Что изменить<textarea class="control" maxlength="6000" required></textarea></label><button class="btn">Отправить правку</button></form>');
  }
  function documents() {
    active={kind:'documents'};
    modal('Готовые документы',(state().documents||[]).map(row=>'<article class="creativeServiceRow"><strong>'+esc(row.title)+'</strong> · '+
      esc(formats[row.format])+action('Предпросмотр','openDocument',row.id)+'</article>').join('')||
      '<p>Попроси Миру в чате сделать документ, таблицу или презентацию.</p>');
  }
  async function showMemory() {
    active={kind:'memory'};
    memory=await call('memoryStatus');
    const s=state().settings;
    modal('Память по чатам',
      '<label><input type="checkbox" id="creativeMemory" '+(s.personalMemory?'checked':'')+'> Обобщать разговоры каждые 48 часов</label>'+
      '<p>Сводку обрабатывает выбранная модель. При облачном подключении фрагменты чатов отправляются этому сервису.</p>'+
      action('Обновить сводку сейчас','updateMemory')+action('Очистить сводку','clearMemory')+
      (memory.updatedAt?'<p>Обновлено '+esc(new Date(memory.updatedAt).toLocaleString())+'</p>':'')+
      (memory.error?'<p role="alert">'+esc(memory.error)+'</p>':'')+
      (memory.summary?'<section><h3>Сводка</h3><p>'+esc(memory.summary)+'</p></section>':'')+
      (memory.style?'<section><h3>Предпочтения из разговоров</h3><p>'+esc(memory.style)+'</p></section>':'')+
      '<label class="field">Как тебе удобнее получать ответы<textarea id="creativeStyle" class="control" maxlength="1800">'+
      esc(s.personalStyle||'')+'</textarea></label>'+action('Сохранить предпочтения','saveStyle'));
  }
  host.addEventListener('click',async event=>{
    const b=event.target.closest('[data-creative]');
    if (!b) return;
    event.preventDefault();
    const {creative:op,id}=b.dataset;
    try {
      if (op==='saveDocument') await call('saveDocument',{id});
      if (op==='openDocument') await view({kind:'document',id});
      if (op==='openWidgetProject') await call('customWidgetProject',{id,open:true});
      if (op==='updateMemory') {
        b.disabled=true; b.textContent='Обновляю сводку…';
        try {await call('memoryUpdate');} finally {if ($('#creativeMemory')) await showMemory();}
      }
      if (op==='clearMemory' && window.confirm('Очистить сводку и выученные предпочтения?')) {
        await call('memoryClear'); await showMemory();
      }
      if (op==='saveStyle') {
        await saveSettings({personalStyle:$('#creativeStyle').value}); toast('Предпочтения сохранены');
      }
      if (op==='openMail') {close();await openMail();}
      if (op==='openService') await call('url',{url:id});
      if (op==='previewAccountItem') {
        b.disabled=true;
        let item;
        try {item=await call('accountPreview',{id,service});} finally {b.disabled=false;}
        if ($('#creativeProvider') && $('#modal').open) {
          selection=item;
          modal(item.title,'<pre class="creativeAccountPreview">'+esc(item.text)+'</pre>'+
            (item.text.trim()?action('Приложить к чату','attachAccountItem'):'')+action('Назад к аккаунтам','backAccounts'));
        }
      }
      if (op==='backAccounts') drawAccounts();
      if (op==='attachAccountItem' && selection)
        attach({kind:'text',name:selection.title,text:selection.text});
      if (op==='disconnectAccount') {await call('accountDisconnect',{provider:id});service=null;await connect();}
      if (op==='cancelAccount') await call('accountCancel',{provider:id});
      if (op==='listAccount') {
        service=id;
        notice='Загружаю…';
        b.disabled=true;
        try {result=await call('accountList',{service:id});notice='';}
        catch(error) {notice=error.message;result=[];}
        if ($('#creativeProvider')) drawAccounts();
      }
      if (op==='beginAccount') {
        const provider=$('#creativeProvider').value;
        const clientId=$('#creativeClientId').value, clientSecret=$('#creativeSecret')?.value||'';
        const requested=Array.from(host.querySelectorAll('[data-creative-service]:checked'),el=>el.dataset.creativeService);
        accountDraft={provider,clientId,services:requested};
        notice='';
        b.disabled=true;
        if ($('#creativeSecret')) $('#creativeSecret').value='';
        stopLoop();
        updateLoop=setInterval(async()=>{
          try {accounts=await call('accountStatus');pendingRows();} catch {}
        },500);
        try {await call('accountBegin',{provider,clientId,clientSecret,services:requested});notice='Аккаунт подключён';}
        catch(error) {notice=error.message;}
        finally {stopLoop();if ($('#creativeProvider') && $('#modal').open) await connect();}
      }
    } catch(error) {reportError(error);}
  });
  host.addEventListener('change',async event=>{
    const el=event.target;
    try {
      if (el.id==='creativeProvider') {
        accountDraft={provider:el.value};notice='';service=null;drawAccounts();
      }
      if (el.id==='creativeMemory') await saveSettings({personalMemory:el.checked});
      if (el.id==='creativeWidgetPlacement' && active?.kind==='widget')
        await call('screenWidget',{id:active.id,mode:el.value});
      if (el.id==='creativeProject' && active?.kind==='widget') {
        await call('customWidgetProject',{id:active.id,projectId:el.value});
      }
      if (el.dataset.creativeField && active?.kind==='widget') {
        await call('customWidgetField',{id:active.id,blockId:el.dataset.creativeField,
          value:el.dataset.task ? {toggle:el.dataset.task} : el.value});
      }
    } catch(error) {reportError(error);}
  });
  host.addEventListener('submit',async event=>{
    const form=event.target;
    try {
      if (form.id==='creativeRevision') {
        event.preventDefault();
        const text=form.querySelector('textarea').value.trim(), ref=active;
        if (!text) return;
        close();
        await send(text,false,ref);
        if (ref) await view(ref);
      }
      if (form.dataset.addWidget && active?.kind==='widget') {
        event.preventDefault();
        await call('customWidgetField',{id:active.id,blockId:form.dataset.addWidget,value:form.querySelector('input').value});
        await view(active);
      }
    } catch(error) {reportError(error);}
  });
  return {view,documents,connect,showMemory};
}
