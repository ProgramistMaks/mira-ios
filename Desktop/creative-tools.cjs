const { randomUUID } = require('node:crypto');
const { zipSync, strToU8 } = require('fflate');
const XLSX = require('@e965/xlsx');

const formats = { docx:'документ', xlsx:'таблица', pptx:'презентация' };
const blockTypes = ['text','checklist','progress','date','project'];
const clean = (value, limit = 400) => typeof value === 'string' ? value.trim().slice(0,limit) : '';
const calendarDate = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
function responseObject(text) {
  const raw = String(text).trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/gi,'');
  const result = JSON.parse(raw);
  if (!result || Array.isArray(result) || typeof result !== 'object') throw Error('Модель не вернула объект JSON');
  return result;
}

function creativeIntent(text, previous) {
  const action = /^(?:\s*мир[аы][,! ]+)?\s*(?:сделай|создай|подготовь|собери|напиши|составь|сгенерируй|create|make|prepare|generate)(?=\s|$)/iu.test(text);
  if (action) {
    if (/(?:виджет|widget)/iu.test(text)) return {kind:'widget'};
    if (/(?:презентаци|слайд|powerpoint|pptx|presentation|slides)/iu.test(text)) return {kind:'document',format:'pptx'};
    if (/(?:таблиц|excel|xlsx|spreadsheet)/iu.test(text)) return {kind:'document',format:'xlsx'};
    if (/(?:документ|word|docx|document)/iu.test(text)) return {kind:'document',format:'docx'};
  }
  const edit = /^(?:\s*мир[аы][,! ]+)?\s*(?:измени|переделай|исправь|добавь|убери|удали|замени|обнови|сократи|расширь|edit|change|remove|add|revise|update)(?=\s|$)/iu.test(text);
  if (edit && previous && !/^(?:добавь задачу|добавь заметку|удали заметку|добавь напоминание)(?:\s|$)/iu.test(text.trim()))
    return {kind:previous.kind,id:previous.id,format:previous.format};
  return null;
}

function widgetLayout(raw, previous) {
  if (!Array.isArray(raw.blocks)) throw Error('Модель не вернула блоки виджета');
  const title = clean(raw.title,90);
  if (!title) throw Error('Укажи название виджета');
  const blocks = [], used = new Set();
  for (const item of raw.blocks.slice(0,8)) {
    if (!item || !blockTypes.includes(item.type)) continue;
    const available = [...(previous?.blocks||[]),...(previous?.hidden||[])].filter(block=>block.type===item.type&&!used.has(block.id));
    const old = available.find(block=>block.id===item.id)
      || available.find(block=>clean(item.label,90).toLowerCase()===block.label.toLowerCase())
      || available[0];
    const label = clean(item.label,90) || old?.label || item.type;
    const id = old?.id || randomUUID();
    if (old) used.add(old.id);
    let value;
    if (item.type === 'checklist') {
      value = old?.value ?? (Array.isArray(item.items) ? item.items.slice(0,25).map(x=>clean(x,160)).filter(Boolean).map(text=>({id:randomUUID(),text,done:false})) : []);
    } else if (item.type === 'progress') {
      value = old?.value ?? Math.round(Math.max(0,Math.min(100,Number(item.value)||0)));
    } else if (item.type === 'date') {
      value = old?.value ?? (calendarDate(item.value) ? item.value : '');
    } else if (item.type === 'project') {
      value = old?.value ?? '';
    } else value = old?.value ?? clean(item.value,1500);
    blocks.push({id,type:item.type,label,value});
  }
  if (!blocks.length) throw Error('В виджете нужен хотя бы один блок');
  const hidden=[...(previous?.blocks||[]),...(previous?.hidden||[])].filter(block=>!used.has(block.id)).slice(0,24);
  return {title,compact:typeof raw.compact === 'boolean' ? raw.compact : !!previous?.compact,blocks,hidden};
}

function widgetField(widget, blockId, value) {
  const block = widget.blocks.find(b=>b.id===blockId);
  if (!block) throw Error('Поле виджета не найдено');
  if (block.type==='checklist') {
    if (value && typeof value==='object' && typeof value.toggle==='string') {
      const row=block.value.find(x=>x.id===value.toggle);
      if (row) row.done=!row.done;
    } else {
      const text=clean(value,160);
      if (!text || block.value.length>=25) throw Error('Проверь текст задачи');
      block.value.push({id:randomUUID(),text,done:false});
    }
  } else if (block.type==='date') {
    if (value!=='' && !calendarDate(value)) throw Error('Проверь дату');
    block.value=value;
  } else if (block.type==='progress') {
    const number=Number(value);
    if (!Number.isFinite(number) || number<0 || number>100) throw Error('Введи число от 0 до 100');
    block.value=Math.round(number);
  } else if (block.type==='text') block.value=clean(value,1500);
}

function documentContent(format, raw) {
  const title=clean(raw.title,110);
  if (!title || !Object.hasOwn(formats,format)) throw Error('Проверь название и формат файла');
  if (format==='xlsx') {
    const rows=Array.isArray(raw.rows) ? raw.rows.slice(0,80).filter(Array.isArray).map(row=>row.slice(0,12)
      .map(cell=>typeof cell==='number' && Number.isFinite(cell) ? cell : clean(cell,350))) : [];
    if (!rows.length) throw Error('В таблице нужны строки');
    return {title,rows};
  }
  const sections=Array.isArray(raw.sections) ? raw.sections.slice(0,format==='pptx'?16:28).map(section=>{
    const heading=clean(section?.heading,110);
    const lines=Array.isArray(section?.lines) ? section.lines.slice(0,format==='pptx'?6:14).map(line=>clean(line,format==='pptx'?180:1400)).filter(Boolean) : [];
    return {heading,lines};
  }).filter(x=>x.heading || x.lines.length) : [];
  if (!sections.length) throw Error('В файле нужен хотя бы один раздел');
  return {title,sections};
}

const xml = value => String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'})[c]);
const header = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rootRels = (target) => rels([[1,'officeDocument',target]]);
function rels(rows) {
  return '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rows.map(([id,type,target])=>'<Relationship Id="rId'+id+'" Type="'+office+'/'+type+'" Target="'+target+'"/>').join('')+'</Relationships>';
}
function types(rows) {
  return '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+rows.map(([name,type])=>'<Override PartName="/'+name+'" ContentType="application/vnd.openxmlformats-officedocument.'+type+'+xml"/>').join('')+'</Types>';
}
function archive(files) {
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([name,data])=>[name,strToU8(header+data)]))));
}
function word(content) {
  const paragraph=(text,size,bold=false)=>'<w:p><w:pPr><w:spacing w:after="180"/></w:pPr><w:r><w:rPr>'+(bold?'<w:b/>':'')+'<w:sz w:val="'+size+'"/></w:rPr><w:t xml:space="preserve">'+xml(text)+'</w:t></w:r></w:p>';
  return archive({
    '[Content_Types].xml':types([['word/document.xml','wordprocessingml.document.main']]),
    '_rels/.rels':rootRels('word/document.xml'),
    'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+
      paragraph(content.title,52,true)+content.sections.map(({heading,lines})=>(heading?paragraph(heading,32,true):'')+lines.map(line=>paragraph(line,24)).join('')).join('')+
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1120" w:right="1150" w:bottom="1120" w:left="1150"/></w:sectPr></w:body></w:document>',
  });
}
const draw='http://schemas.openxmlformats.org/drawingml/2006/main';
const slides='http://schemas.openxmlformats.org/presentationml/2006/main';
const slideNS=' xmlns:a="'+draw+'" xmlns:r="'+office+'" xmlns:p="'+slides+'"';
const groupStart='<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const common=(shapes='')=>'<p:cSld><p:spTree>'+groupStart+shapes+'</p:spTree></p:cSld>';
const colorMap='<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
const colors={dk1:'1D2234',lt1:'FFF8ED',dk2:'273247',lt2:'F8E5D2',accent1:'5E4894',accent2:'167D82',accent3:'CC8165',accent4:'9C70BB',accent5:'6F8FA6',accent6:'C4944A',hlink:'1C6785',folHlink:'754E94'};
function theme() {
  const font = '<a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/>';
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  return '<a:theme xmlns:a="'+draw+'" name="Mira"><a:themeElements><a:clrScheme name="Mira">'+
    Object.entries(colors).map(([tag,value])=>'<a:'+tag+'><a:srgbClr val="'+value+'"/></a:'+tag+'>').join('')+
    '</a:clrScheme><a:fontScheme name="Mira"><a:majorFont>'+font+'</a:majorFont><a:minorFont>'+font+'</a:minorFont></a:fontScheme>'+
    '<a:fmtScheme name="Mira"><a:fillStyleLst>'+fill.repeat(3)+'</a:fillStyleLst><a:lnStyleLst>'+('<a:ln w="9525">'+fill+'</a:ln>').repeat(3)+
    '</a:lnStyleLst><a:effectStyleLst>'+('<a:effectStyle><a:effectLst/></a:effectStyle>').repeat(3)+'</a:effectStyleLst><a:bgFillStyleLst>'+fill.repeat(3)+
    '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
}
function textBox(id,y,height,text,size,color) {
  return '<p:sp><p:nvSpPr><p:cNvPr id="'+id+'" name="Text '+id+'"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="780000" y="'+y+'"/><a:ext cx="10500000" cy="'+height+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>'+
    text.map(line=>'<a:p><a:pPr><a:spcAft><a:spcPts val="1200"/></a:spcAft></a:pPr><a:r><a:rPr sz="'+size+'"><a:solidFill><a:srgbClr val="'+color+'"/></a:solidFill></a:rPr><a:t>'+xml(line)+'</a:t></a:r></a:p>').join('')+'</p:txBody></p:sp>';
}
function presentation(content) {
  const entries=[{heading:content.title,lines:[]},...content.sections];
  const rows=[['ppt/presentation.xml','presentationml.presentation.main'],['ppt/slideMasters/slideMaster1.xml','presentationml.slideMaster'],['ppt/slideLayouts/slideLayout1.xml','presentationml.slideLayout'],['ppt/theme/theme1.xml','theme']];
  const links=[[1,'slideMaster','slideMasters/slideMaster1.xml']];
  const files={
    '_rels/.rels':rootRels('ppt/presentation.xml'),
    'ppt/slideMasters/slideMaster1.xml':'<p:sldMaster'+slideNS+'>'+common()+colorMap+'<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles/></p:sldMaster>',
    'ppt/slideMasters/_rels/slideMaster1.xml.rels':rels([[1,'slideLayout','../slideLayouts/slideLayout1.xml'],[2,'theme','../theme/theme1.xml']]),
    'ppt/slideLayouts/slideLayout1.xml':'<p:sldLayout'+slideNS+' type="blank">'+common()+'<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>',
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels':rels([[1,'slideMaster','../slideMasters/slideMaster1.xml']]),
    'ppt/theme/theme1.xml':theme(),
  };
  const ids=entries.map(({heading,lines},i)=>{
    const n=i+1;
    const title=textBox(2,i?510000:2300000,1600000,[heading || content.title],i?3700:4800,colors.accent1);
    const body=lines.length ? textBox(3,2210000,4250000,lines.map(line=>'• '+line),2400,colors.dk1) : '';
    rows.push(['ppt/slides/slide'+n+'.xml','presentationml.slide']);
    files['ppt/slides/slide'+n+'.xml']='<p:sld'+slideNS+'>'+common(title+body)+'<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
    files['ppt/slides/_rels/slide'+n+'.xml.rels']=rels([[1,'slideLayout','../slideLayouts/slideLayout1.xml']]);
    links.push([n+1,'slide','slides/slide'+n+'.xml']);
    return '<p:sldId id="'+(255+n)+'" r:id="rId'+(n+1)+'"/>';
  }).join('');
  files['ppt/presentation.xml']='<p:presentation'+slideNS+'><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>'+ids+'</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
  files['ppt/_rels/presentation.xml.rels']=rels(links);
  files['[Content_Types].xml']=types(rows);
  return archive(files);
}

function documentBytes(doc) {
  if (doc.format==='docx') return word(doc);
  if (doc.format==='pptx') return presentation(doc);
  if (doc.format!=='xlsx') throw Error('Неизвестный формат документа');
  const wb=XLSX.utils.book_new();
  const sheet=XLSX.utils.aoa_to_sheet(doc.rows);
  sheet['!cols']=Array.from({length:Math.max(...doc.rows.map(row=>row.length))},(_,i)=>({wch:Math.min(52,Math.max(14,...doc.rows.map(row=>String(row[i]??'').length+2)))}));
  XLSX.utils.book_append_sheet(wb,sheet,'Мира');
  return XLSX.write(wb,{bookType:'xlsx',type:'buffer'});
}

module.exports={creativeIntent,responseObject,widgetLayout,widgetField,documentContent,documentBytes,formats};
