const moods=['neutral','warm','joy','care','explain','curious','unsure'];
const prefix='[[mira:';
const instruction='В начале ответа выведи служебную строку [[mira:ИМЯ]], затем ответ. Выбери ровно одно состояние по смыслу ответа: neutral (спокойно), warm (тёплое приветствие), joy (радость или поздравление), care (поддержка), explain (объяснение), curious (интерес или уточнение), unsure (неуверенность). Используй только английское имя из списка.';

function avatarIntent(emit,onText) {
  let sent=false;
  function filter(value,final=false) {
    const text=String(value);
    const start=text.trimStart();
    if (!final && (prefix.startsWith(start) || (start.startsWith(prefix) && start.length<32 && !start.includes(']]') && !start.includes('\n')))) return null;
    const match=/^\[\[mira:([a-z]+)\]\][ \t]*(?:\r?\n)?/i.exec(start);
    if (!sent && match) {
      const mood=match[1].toLowerCase();
      sent=true;
      if (moods.includes(mood)) emit(mood);
    }
    if (match) return start.slice(match[0].length).trimStart();
    if (final && start.startsWith(prefix) && !start.includes('\n') && !start.includes(']]')) return '';
    return text;
  }
  return {stream:onText && (value=>{const text=filter(value);if(text!==null) onText(text);}),finish:value=>filter(value,true)};
}
module.exports={avatarIntent,instruction,moods};
