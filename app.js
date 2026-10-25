import {makeState, calculate, moduleTotal, setModule, setOption, restore, normalizeCalendar} from './model.js?v=2';
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('ru-RU').format(n);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = 'wmr-pricing-v2';
let catalog, originalHTML, state, filter = 'all', category = 'all', expanded = true, toastTimer;

function showToast(text) {
  clearTimeout(toastTimer);
  $('toast').textContent = text;
  $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4200);
}
function persist() {
  try { localStorage.setItem(key, JSON.stringify(state)); return true; }
  catch { $('modSaveMsg').textContent = 'Хранилище недоступно — выбор действует до перезагрузки.'; return false; }
}
function renderNav() {
  $('category-filter').innerHTML = [['all','Все категории'],...catalog.groups].map(([id,label])=>`<option value="${id}" ${id===category?'selected':''}>${escape(label)}</option>`).join('');
}
function priceTag(text, className='') {
  const span=document.createElement('span');span.className='pricing-option '+className;span.textContent=text;return span;
}
function renderCatalog() {
  const query=$('search').value.trim().toLowerCase();
  $('catalog').innerHTML=originalHTML;
  const form=$('modulesForm');
  form.querySelector(':scope > p').remove();
  form.querySelector('.settings-search').remove();
  form.querySelector('.settings-search-empty').remove();
  form.querySelector('[type="hidden"]')?.remove();
  const masterGroups=[...form.querySelectorAll('#modulesList > .js-search-group')];
  let visible=0;
  for (const [i,[group,label]] of catalog.groups.entries()) {
    const el=masterGroups[i];if(!el)continue;
    el.id=`group-${group}`;el.dataset.group=group;
    const heading=el.querySelector('h6');
    const sum=catalog.modules.filter(m=>m.group===group).reduce((n,m)=>n+moduleTotal(m,state),0);
    heading.append(priceTag(sum?`${money(sum)} ₽/мес`:'Не выбрано','group-price'));
  }
  for (const m of catalog.modules) {
    const card=m.id==='mobile'?$('mobileBlock'):form.querySelector(`[data-module="${m.id}"]`);
    card.removeAttribute('data-module');card.dataset.card=m.id;
    card.classList.add('original-module');card.classList.toggle('enabled',state.modules[m.id]);
    const head=card.querySelector('.card-header');
    let master=head.querySelector('input[type="checkbox"]');
    if(!master){
      head.querySelector('.badge')?.remove();
      const wrap=document.createElement('div');wrap.className='form-check form-switch mb-0 flex-shrink-0';
      master=document.createElement('input');master.type='checkbox';master.className='form-check-input mod-switch';wrap.append(master);head.append(wrap);
    }
    master.id=`module-${m.id}`;master.dataset.module=m.id;master.checked=!!state.modules[m.id];master.setAttribute('aria-label',m.label);
    const priceRow=document.createElement('div');priceRow.className='pricing-module-row';
    priceRow.innerHTML=`<strong>${m.custom?'Индивидуально':`${money(m.price)} ₽ <small>/ мес</small>`}</strong><span>${m.custom?'Вне общего итога':`Выбрано: ${money(moduleTotal(m,state))} ₽`}</span>`;
    head.after(priceRow);
    const sub=card.querySelector('.core-opts,.sub-opts') || (m.id==='mobile'?$('mobileBlockBody'):null);
    if(sub){sub.classList.toggle('d-none',!expanded&&!query);sub.classList.toggle('inactive-options',!state.modules[m.id]);}
    for(const o of m.options){
      if(o.type==='multi'){
        for(const input of card.querySelectorAll(`[data-mo-list="${o.key}"]`)){
          input.dataset.multi=o.key;input.checked=state.values[o.key].includes(input.value);input.disabled=!state.modules[m.id];
          input.closest('.form-check').append(priceTag(`+${money(o.choicePrices[input.value])} ₽`));
        }
        continue;
      }
      const input=[...card.querySelectorAll('input,select')].find(el=>el.name===o.key||el.id===o.key||el.dataset.moKey===o.key||el.dataset.moFlag===o.key||el.dataset.csField===o.key||el.dataset.moSelect===o.key);
      if(!input)throw new Error('Original control missing: '+o.key);
      const oldId=input.id;const label=card.querySelector(`label[for="${oldId}"]`);
      input.id=`opt-${o.key}`;if(label)label.htmlFor=input.id;
      input.disabled=!state.modules[m.id];
      const row=input.closest('.js-search-sub')||input.parentElement;
      if(o.type==='bool'){
        input.checked=!!state.options[o.key];input.dataset.option=o.key;
        const tag=priceTag(`+${money(o.price)} ₽`);if(label)label.after(tag);else row.append(tag);
      }else{
        input.dataset.value=o.key;input.value=state.values[o.key];
        if(o.type==='select'&&o.choicePrices){
          for(const option of input.options)option.textContent=`${o.choices.find(c=>c[0]===option.value)[1]} — ${o.choicePrices[option.value]?`+${money(o.choicePrices[option.value])} ₽/мес`:'без доплаты'}`;
          const hint=document.createElement('div');hint.className='mode-pricing-note';hint.textContent='Ручной: +0 ₽ · Сканерный: +1 000 ₽ · Гибридный: +1 500 ₽';row.append(hint);
        }
        if(o.key==='calendar_default_view')for(const option of input.options)option.disabled=!state.values.calendar_views.includes(option.value);
      }
    }
    let matches=(category==='all'||m.group===category)&&(filter!=='selected'||state.modules[m.id]);
    if(query)matches=matches&&`${m.label} ${m.description} ${m.options.map(o=>`${o.label} ${o.desc||''}`).join(' ')}`.toLowerCase().includes(query);
    card.closest('.js-search-unit').hidden=!matches;if(matches)visible++;
  }
  for(const group of masterGroups)group.hidden=![...group.querySelectorAll('.js-search-unit')].some(el=>!el.hidden);
  $('modSaveBtn').type='button';$('modSaveBtn').addEventListener('click',saveConfiguration);
  form.addEventListener('submit',e=>{e.preventDefault();saveConfiguration();});
  $('modSaveMsg').textContent='Выбор автоматически сохраняется в этом браузере.';
  $('empty').hidden=visible>0;$('catalog').setAttribute('aria-busy','false');
  $('expand').textContent=expanded?'Свернуть настройки':'Раскрыть настройки';
}
function saveConfiguration(){if(persist()){showToast('Конфигурация сохранена в этом браузере.');$('modSaveMsg').textContent='Сохранено';}else showToast('Не удалось сохранить. Скопируйте расчёт, чтобы не потерять выбор.');}
function renderQuote() {
  const bill = calculate(catalog,state);
  $('total').textContent = money(bill.total);
  $('mobile-total').textContent = `${money(bill.total)} ₽/мес${bill.custom ? ' + склады' : ''}`;
  $('module-total').textContent = `${money(bill.modules)} ₽`;
  $('option-total').textContent = `${money(bill.options)} ₽`;
  $('module-count').textContent = catalog.modules.filter(m => state.modules[m.id] && m.price).length;
  $('option-count').textContent = bill.items.filter(i => i.parent).length;
  $('progress-fill').style.width = `${bill.total/catalog.full*100}%`;
  $('package-share').textContent = `${Math.round(bill.total/catalog.full*100)}% полного набора`;
  $('total-caption').textContent = bill.custom ? 'Подписка + индивидуальный расчёт складов' : 'За выбранные модули и настройки';
  $('custom-note').hidden = !bill.custom;
  $('line-count').textContent = `(${bill.items.length})`;
  $('breakdown').innerHTML = bill.items.map(i => `<div class="breakdown-row"><span>${escape(i.label)}${i.parent ? `<small>${escape(i.parent)}</small>` : ''}</span><strong>${money(i.price)} ₽</strong></div>`).join('');
  $('choose-warehouses').textContent = bill.custom ? 'Добавлено к запросу ✓' : 'Добавить к запросу →';
}
function refresh() { renderCatalog(); renderQuote(); persist(); }
function restoreFocus(id) { if (id) $(id)?.focus({preventScroll:true}); }
function configurationText() {
  const bill = calculate(catalog,state);
  const lines = ['WMR — конфигурация подписки', '', ...bill.items.map(i => `${i.parent ? `${i.parent} / ` : ''}${i.label}: ${money(i.price)} ₽/мес`), '', `Итого: ${money(bill.total)} ₽/мес`];
  if (bill.custom) lines.push('Мультисклад: индивидуальный расчёт, сверх указанного итога.');
  lines.push('', 'Включённые модули и настройки:');
  for (const m of catalog.modules.filter(m => state.modules[m.id])) {
    lines.push(m.label);
    for (const o of m.options) {
      if (o.type === 'bool') lines.push(`  ${state.options[o.key] ? '✓' : '—'} ${o.label}`);
      else if (o.type === 'multi') lines.push(`  ${o.label}: ${o.choices.filter(c=>state.values[o.key].includes(c[0])).map(c=>c[1]).join(', ')}`);
      else lines.push(`  ${o.label}: ${o.choices?.find(c=>c[0]===state.values[o.key])?.[1] ?? state.values[o.key]}`);
    }
  }
  lines.push('', 'Прототип ценовой модели. Сервер, внедрение и внешние сервисы оплачиваются отдельно.');
  return lines.join('\n');
}
async function copy() {
  const content = configurationText();
  try { await navigator.clipboard.writeText(content); showToast('Конфигурация и расчёт скопированы.'); }
  catch {
    const blob = new Blob([content],{type:'text/plain;charset=utf-8'}), url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'wmr-configuration.txt'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    showToast('Буфер обмена недоступен. Расчёт скачан текстовым файлом.');
  }
}
async function init() {
  const response = await fetch('./catalog.json?v=2');
  if (!response.ok) throw new Error('catalog');
  catalog = await response.json();
  const markup=await fetch('./modules-original.html?v=2');if(!markup.ok)throw new Error('markup');originalHTML=await markup.text();
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
  state = saved ? restore(catalog,saved) : makeState(catalog,true);
  $('all-count').textContent = catalog.modules.length;
  renderNav(); renderCatalog(); renderQuote();
  $('search').addEventListener('input',renderCatalog);
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click',()=>{
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b=>{ b.classList.toggle('active',b===button); b.setAttribute('aria-pressed',String(b===button)); });
    renderCatalog();
  }));
  $('category-filter').addEventListener('change',e=>{
    category=e.target.value;renderCatalog();
  });
  $('expand').addEventListener('click',()=>{expanded=!expanded;renderCatalog();});
  $('clear-filters').addEventListener('click',()=>{
    $('search').value='';category='all';document.querySelector('[data-filter="all"]').click();renderNav();
  });
  $('catalog').addEventListener('change',e=>{
    const el = e.target, id = el.id;
    if (el.dataset.module) {
      const notices = setModule(catalog,state,el.dataset.module,el.checked);
      if (notices.length) showToast(notices.join(' '));
      if (el.dataset.module==='multiwarehouse' && el.checked) showToast('Мультисклад добавлен к запросу. Цена согласуется отдельно.');
    } else if (el.dataset.option) {
      setOption(state,el.dataset.option,el.checked);
      if (el.checked && ['staff_rate_agreement','staff_timesheet'].includes(el.dataset.option)) showToast('Режим оплаты переключён. Договорная цена и табель взаимоисключающие.');
    } else if (el.dataset.multi) {
      const selected = new Set(state.values[el.dataset.multi]);
      if (el.checked) selected.add(el.value); else selected.delete(el.value);
      if (!selected.size) { el.checked=true;showToast('Оставьте хотя бы один вид календаря.');return; }
      state.values[el.dataset.multi] = [...selected]; normalizeCalendar(state);
    } else if (el.dataset.value) {
      if (!el.checkValidity()) { el.reportValidity(); return; }
      state.values[el.dataset.value] = el.type==='number' ? Number(el.value) : el.value;
      normalizeCalendar(state);
    } else return;
    refresh();restoreFocus(id);
  });
  $('full').addEventListener('click',()=>{
    const custom = state.modules.multiwarehouse;
    state=makeState(catalog,true);state.modules.multiwarehouse=custom;refresh();
    showToast('Полный набор — 50 000 ₽/мес. Мультисклад рассчитывается отдельно.');
  });
  $('clear-all').addEventListener('click',()=>{state=makeState(catalog);refresh();showToast('Всё выключено. Стоимость — 0 ₽/мес.');});
  $('choose-warehouses').addEventListener('click',()=>{state.modules.multiwarehouse=true;refresh();showToast('Мультисклад добавлен к запросу без изменения суммы.');});
  $('copy').addEventListener('click',copy);
  try { document.body.classList.toggle('dark',localStorage.getItem('wmr-pricing-theme')==='dark'); } catch {}
  $('theme-toggle').addEventListener('click',()=>{
    const dark=document.body.classList.toggle('dark');
    $('theme-toggle').innerHTML=`<i class="bi bi-${dark?'sun':'moon'}"></i>`;
    try {localStorage.setItem('wmr-pricing-theme',dark?'dark':'light');} catch {}
  });
  document.querySelectorAll('.app-menu a').forEach(a=>a.addEventListener('click',()=>{
    if(category!=='all'||filter!=='all'||$('search').value){category='all';filter='all';$('search').value='';document.querySelector('[data-filter="all"]').click();renderNav();}
  }));
  document.querySelectorAll('.original-settings-nav a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();if(!a.classList.contains('active'))showToast('В этом прототипе доступна вкладка «Модули».');}));

}
init().catch(()=>{
  $('catalog').setAttribute('aria-busy','false');
  $('catalog').innerHTML='<p class="loading">Не удалось загрузить список модулей. Обновите страницу.</p>';
  $('full').disabled=true; $('clear-all').disabled=true; $('copy').disabled=true; $('choose-warehouses').disabled=true;
});
