const http = require('node:http');
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const googleServices={
  drive:'https://www.googleapis.com/auth/drive.readonly',
  calendar:'https://www.googleapis.com/auth/calendar.events.readonly',
  gmail:'https://www.googleapis.com/auth/gmail.readonly',
};
const providers={
  google:{auth:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',profile:'https://openidconnect.googleapis.com/v1/userinfo'},
  github:{device:'https://github.com/login/device/code',token:'https://github.com/login/oauth/access_token',profile:'https://api.github.com/user'},
  yandex:{auth:'https://oauth.yandex.com/authorize',token:'https://oauth.yandex.com/token',profile:'https://login.yandex.ru/info?format=json'},
};
const uuid = () => randomBytes(32).toString('base64url');
const url = (address,params) => {
  const result=new URL(address);
  for (const [key,value] of Object.entries(params||{})) result.searchParams.set(key,value);
  return result.href;
};
const text=value=>typeof value==='string'?value.slice(0,500):'';
const validId=value=>/^[A-Za-z\d._-]{3,240}$/.test(value);
const safeEqual=(a,b)=>typeof a==='string' && typeof b==='string' &&
  Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function boundedText(response,limit) {
  const chunks=[];
  let length=0;
  if (!response.body) return '';
  for await (const chunk of response.body) {
    length+=chunk.byteLength;
    if (length>limit) throw Error('Файл слишком большой для предпросмотра');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function json(fetcher,address,options={},signal) {
  const timeout=AbortSignal.timeout(26000);
  const response=await fetcher(address,{...options,redirect:'error',signal:signal?AbortSignal.any([timeout,signal]):timeout});
  const type=response.headers.get('content-type')||'';
  if (!type.includes('json')) throw Error('Сервис аккаунта вернул неизвестный ответ (HTTP '+response.status+')');
  const result=JSON.parse(await boundedText(response,3*1024*1024));
  if (!response.ok && !result.error) throw Error('Сервис аккаунта вернул HTTP '+response.status);
  return result;
}
const post=(fetcher,address,params,signal)=>json(fetcher,address,{
  method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams(params),
},signal);

async function authorizationCode(provider,config,open,signal) {
  const state=uuid(), secret=uuid();
  const challenge=createHash('sha256').update(secret).digest('base64url');
  let done;
  const server=http.createServer((request,response)=>{
    if (!request.url?.startsWith('/oauth/callback?')) {
      response.writeHead(404).end('Not found');
      return;
    }
    const requestURL=new URL(request.url,'http://127.0.0.1');
    const params=requestURL.searchParams;
    if (request.method!=='GET' || requestURL.pathname!=='/oauth/callback' || !safeEqual(params.get('state'),state)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const code=params.get('code');
    const ok=!!code && !params.has('error');
    response.writeHead(ok?200:400,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Connection':'close'})
      .end(ok?'Аккаунт подключается. Вернись в Миру.':'Подключение аккаунта отменено.');
    done(ok ? {code} : {error:Error('Пользователь не подтвердил доступ')});
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(provider==='yandex'?43821:0,'127.0.0.1',()=>{server.off('error',reject);resolve();});
  });
  const redirect='http://127.0.0.1:'+server.address().port+'/oauth/callback';
  const abort=()=>done({error:signal.reason});
  const received=new Promise(resolve=>{done=resolve;});
  signal.addEventListener('abort',abort,{once:true});
  try {
    signal.throwIfAborted();
    const scope=provider==='google'
      ? ['openid','email','profile',...config.services.map(x=>googleServices[x])].join(' ')
      : 'login:info login:email';
    await open(url(providers[provider].auth,{
      client_id:config.clientId,response_type:'code',redirect_uri:redirect,state,scope,code_challenge:challenge,code_challenge_method:'S256',
      ...(provider==='google'?{access_type:'offline',prompt:'consent'}:{}),
    }));
    const result=await received;
    if (result.error) throw result.error;
    return {grant_type:'authorization_code',code:result.code,code_verifier:secret,redirect_uri:redirect};
  } finally {
    signal.removeEventListener('abort',abort);
    server.close();
  }
}

class Accounts {
  constructor({data,read,write,clear,save,open,fetcher=fetch}) {
    Object.assign(this,{data,read,write,clear,save,open,fetcher});
    this.jobs=new Map();
    this.tokens=new Map();
    this.refreshing=new Map();
  }
  status() {
    return Object.keys(providers).map(provider=>({provider,...this.data[provider],
      pending:this.jobs.get(provider)?.pending||null,connected:!!(this.tokens.has(provider)||this.stored(provider))}));
  }
  stored(provider) {
    try {return this.read(provider);} catch {return '';}
  }
  async begin(provider,input) {
    if (!Object.hasOwn(providers,provider) || this.jobs.has(provider)) throw Error('Подключение уже запущено или сервис неизвестен');
    const clientId=String(input.clientId||'').trim();
    const clientSecret=String(input.clientSecret||'').trim().slice(0,300);
    if (!validId(clientId) || (provider!=='github' && !clientSecret)) throw Error('Укажи Client ID и Client Secret приложения OAuth');
    const services=provider==='google' && Array.isArray(input.services) ?
      [...new Set(input.services.filter(key=>Object.hasOwn(googleServices,key)))] : [];
    const config={clientId,clientSecret,services};
    const controller=new AbortController();
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(5*60*1000)]);
    const job={controller,pending:{type:'browser'}};
    this.jobs.set(provider,job);
    try {
      const reply=provider==='github' ? await this.device(config,job,signal) : await this.token(provider,config,await authorizationCode(provider,config,this.open,signal),signal);
      const credentials=this.credentials(config,reply);
      const profile=await this.api(provider,providers[provider].profile,credentials.access,signal);
      signal.throwIfAborted();
      const label=text(profile.email || profile.default_email || profile.login || profile.name || profile.real_name || profile.sub);
      if (!label) throw Error('Сервис не вернул профиль аккаунта');
      if (reply.scope && provider==='google') {
        const accepted=new Set(reply.scope.split(/\s+/));
        credentials.services=services.filter(name=>accepted.has(googleServices[name]));
      }
      const persisted=this.write(provider,JSON.stringify(credentials));
      this.tokens.set(provider,credentials);
      this.data[provider]={label,services:credentials.services,sessionOnly:!persisted};
      this.save();
      return {provider,label};
    } finally {
      if (this.jobs.get(provider)===job) this.jobs.delete(provider);
    }
  }
  async device(config,job,signal) {
    const result=await post(this.fetcher,providers.github.device,{client_id:config.clientId,scope:'read:user'},signal);
    if (!result.device_code || typeof result.user_code!=='string' || result.verification_uri!=='https://github.com/login/device')
      throw Error('GitHub не разрешил Device Flow для этого Client ID');
    job.pending={type:'device',code:text(result.user_code)};
    await this.open(result.verification_uri);
    let seconds=Math.max(5,+result.interval||5);
    const end=Date.now()+1000*Math.min(300,+result.expires_in||300);
    while (Date.now()<end) {
      await delay(seconds*1000,null,{signal});
      const data=await post(this.fetcher,providers.github.token,{
        client_id:config.clientId,device_code:result.device_code,grant_type:'urn:ietf:params:oauth:grant-type:device_code',
      },signal);
      if (data.access_token) return data;
      if (data.error==='slow_down') {seconds+=5;continue;}
      if (data.error!=='authorization_pending') throw Error('GitHub отклонил подключение: '+text(data.error));
    }
    throw Error('Код GitHub истёк');
  }
  async token(provider,config,grant,signal) {
    const result=await post(this.fetcher,providers[provider].token,{
      client_id:config.clientId,client_secret:config.clientSecret,...grant,
    },signal);
    if (!result.access_token) throw Error('Сервис отклонил OAuth: '+text(result.error||'token_missing'));
    return result;
  }
  credentials(config,data) {
    const expires=Number(data.expires_in);
    return {...config,access:text(data.access_token),
      refresh:text(data.refresh_token)||config.refresh,
      expires:Number.isFinite(expires) && expires>0 ? Date.now()+expires*1000 : 0};
  }
  async access(provider) {
    if (!Object.hasOwn(providers,provider)) throw Error('Неизвестный аккаунт');
    let value=this.tokens.get(provider);
    if (!value) {
      const raw=this.stored(provider);
      if (raw) {
        value=JSON.parse(raw);
        this.tokens.set(provider,value);
      }
    }
    if (!value?.access) throw Error('Сначала подключи аккаунт');
    if (!value.expires || value.expires>Date.now()+45000) return value;
    if (!value.refresh) throw Error('Сеанс истёк. Подключи аккаунт снова');
    if (!this.refreshing.has(provider)) {
      const pending=this.token(provider,value,{grant_type:'refresh_token',refresh_token:value.refresh}).then(raw=>{
        if (this.tokens.get(provider)!==value) throw Error('Подключение аккаунта изменилось');
        const next=this.credentials(value,raw);
        this.tokens.set(provider,next);
        this.write(provider,JSON.stringify(next));
        return next;
      }).finally(()=>this.refreshing.delete(provider));
      this.refreshing.set(provider,pending);
    }
    return this.refreshing.get(provider);
  }
  cancel(provider) { this.jobs.get(provider)?.controller.abort(); }
  disconnect(provider) {
    if (!Object.hasOwn(providers,provider)) return;
    this.cancel(provider);
    this.tokens.delete(provider);
    this.clear(provider);
    delete this.data[provider];
    this.save();
  }
  async api(provider,address,token,signal) {
    const result=await json(this.fetcher,address,{headers:{Accept:'application/json',
      Authorization:(provider==='yandex'?'OAuth ':'Bearer ')+token,
      ...(provider==='github'?{'User-Agent':'Mira-Desktop','X-GitHub-Api-Version':'2022-11-28'}:{}),
    }},signal);
    if (result.error) throw Error('Сервис аккаунта не дал доступ. Проверь разрешения и подключение');
    return result;
  }
  async list(service) {
    const provider=service==='github'?'github':'google';
    if (!['github','drive','calendar','gmail'].includes(service)) throw Error('Неизвестный сервис');
    const value=await this.access(provider);
    if (provider==='google' && !value.services.includes(service)) throw Error('Подключи Google с разрешением для этого сервиса');
    const call=(address,params)=>this.api(provider,url(address,params),value.access);
    if (service==='github') {
      const rows=await call('https://api.github.com/user/repos',{visibility:'public',affiliation:'owner',per_page:25,sort:'updated'});
      return rows.map(row=>({title:text(row.full_name),detail:text(row.description),link:'https://github.com/'+String(row.full_name).split('/').map(encodeURIComponent).join('/')}));
    }
    if (service==='drive') {
      const data=await call('https://www.googleapis.com/drive/v3/files',{q:'trashed = false',fields:'files(id,name,description,mimeType),nextPageToken',pageSize:25,orderBy:'modifiedTime desc'});
      return (data.files||[]).map(row=>({title:text(row.name),detail:text(row.description),link:'https://drive.google.com/open?id='+encodeURIComponent(row.id),
        id:row.id,preview:!!driveFormat(row.mimeType)}));
    }
    if (service==='calendar') {
      const data=await call('https://www.googleapis.com/calendar/v3/calendars/primary/events',{timeMin:new Date().toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:25});
      return (data.items||[]).map(row=>({title:text(row.summary),detail:text(row.start?.dateTime||row.start?.date),
        link:typeof row.htmlLink==='string' && row.htmlLink.startsWith('https://www.google.com/calendar/')?row.htmlLink:'https://calendar.google.com/'}));
    }
    const root='https://gmail.googleapis.com/gmail/v1/users/me/messages';
    const data=await call(root,{labelIds:'INBOX',maxResults:12});
    const rows=await Promise.all((data.messages||[]).slice(0,12).map(row=>call(root+'/'+encodeURIComponent(row.id),{format:'metadata',metadataHeaders:'Subject'})));
    return rows.map(row=>({title:subject(row),detail:text(row.snippet),link:'https://mail.google.com/mail/u/0/#inbox/'+encodeURIComponent(row.id),
      id:row.id,preview:true}));
  }
  async preview(service,id) {
    if (!['drive','gmail'].includes(service) || !/^[a-z\d_-]{1,150}$/i.test(id)) throw Error('Неизвестный файл или письмо');
    const value=await this.access('google');
    if (!value.services.includes(service)) throw Error('Подключи Google с разрешением для этого сервиса');
    if (service==='gmail') {
      const root='https://gmail.googleapis.com/gmail/v1/users/me/messages/'+encodeURIComponent(id);
      const message=await this.api('google',url(root,{format:'full'}),value.access);
      const queue=[message.payload].filter(Boolean);
      for (let i=0;i<queue.length&&queue.length<100;i++) queue.push(...(queue[i].parts||[]).slice(0,100-queue.length));
      const body=queue.find(part=>part.mimeType==='text/plain'&&part.body?.data)
        ||queue.find(part=>part.mimeType==='text/html'&&part.body?.data);
      let contents=body ? Buffer.from(body.body.data,'base64url').toString('utf8').slice(0,60000) : message.snippet||'';
      if (body?.mimeType==='text/html') contents=require('html-to-text').convert(contents,{wordwrap:false});
      return {title:subject(message),text:contents.slice(0,20000)};
    }
    const root='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id);
    const file=await this.api('google',url(root,{fields:'name,mimeType'}),value.access);
    const format=driveFormat(file.mimeType);
    if (!format) throw Error('Этот формат можно открыть в Google Drive');
    const response=await this.fetcher(format==='raw'?url(root,{alt:'media'}):url(root+'/export',{mimeType:format}),
      {headers:{Authorization:'Bearer '+value.access},redirect:'error',signal:AbortSignal.timeout(26000)});
    if (!response.ok) throw Error('Google Drive вернул HTTP '+response.status);
    return {title:text(file.name),text:(await boundedText(response,512*1024)).slice(0,32000)};
  }
}
const subject=row=>text(row.payload?.headers?.find(h=>h.name.toLowerCase()==='subject')?.value)||'Без темы';
function driveFormat(type) {
  if (type==='application/vnd.google-apps.document') return 'text/plain';
  if (type==='application/vnd.google-apps.spreadsheet') return 'text/csv';
  if (['text/plain','text/csv','text/markdown','application/json'].includes(type)) return 'raw';
  return '';
}
module.exports={Accounts,authorizationCode,providers,googleServices};
