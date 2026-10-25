import {makeState, calculate, moduleTotal, setModule, setOption, restore, normalizeCalendar} from './model.js';
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('ru-RU').format(n);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = 'wmr-pricing-v1';
let catalog, state, filter = 'all', category = 'all', expanded = false, toastTimer;
const opened = new Set();
const paths = {
  all:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  projects:'M4 5h16v15H4zM8 3v4M16 3v4M4 10h16M8 14h3M14 14h2',
  warehouse:'M3 9l9-6 9 6v11H3zM8 20v-9h8v9M8 15h8',
  team:'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-2a7 7 0 0 1 14 0v2M16 5a4 4 0 0 1 0 8M19 16a5 5 0 0 1 3 5',
  monitoring:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 20h4',
  public:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18',
  crm:'M4 4h15v17H4zM8 4v17M11 9h5M11 13h5M2 8h4M2 13h4M2 18h4',
  integration:'M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v5',
  extra:'M4 4h16v16H4zM8 12h8M12 8v8',
  mobile:'M7 2h10v20H7zM10 18h4'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.all}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const toggle = (id, checked, attrs = '', disabled = false) => `<label class="switch"><input id="${escape(id)}" type="checkbox" role="switch" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} ${attrs}><span class="switch-track"></span></label>`;
const optionCost = o => o.price ? `+${money(o.price)} ₽` : 'Включено · 0 ₽';

function showToast(text) {
  clearTimeout(toastTimer);
  $('toast').textContent = text;
  $('toast').classList.add('visible');
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4200);
}
function persist() {
  try { localStorage.setItem(key, JSON.stringify(state)); }
  catch { $('quote').querySelector('.quote-foot small').textContent = 'Хранилище недоступно — выбор действует до перезагрузки.'; }
}
function optionHTML(m, o) {
  const id = `opt-${o.key}`, enabled = !!state.modules[m.id];
  const help = o.desc ? `<span class="option-help" tabindex="0" title="${escape(o.desc)}" aria-label="${escape(o.desc)}">?</span>` : '';
  const label = `<div class="option-label"><label for="${id}">${escape(o.label)}</label>${help}</div>`;
  const price = `<span class="option-price ${o.price ? 'paid' : ''}">${optionCost(o)}</span>`;
  const disabled = enabled ? '' : 'disabled';
  if (o.type === 'bool') return `<div class="option">${label}${price}${toggle(id, state.options[o.key], `data-option="${o.key}" aria-label="${escape(o.label)}: ${optionCost(o)}"`, !enabled)}</div>`;
  let control = '';
  if (o.type === 'select') {
    control = `<select id="${id}" data-value="${o.key}" ${disabled}>${(o.choices || []).map(([v,l]) => `<option value="${escape(v)}" ${state.values[o.key] === v ? 'selected' : ''} ${o.key === 'calendar_default_view' && !state.values.calendar_views.includes(v) ? 'disabled' : ''}>${escape(l)}</option>`).join('')}</select>`;
  } else if (o.type === 'int') {
    control = `<input id="${id}" data-value="${o.key}" type="number" min="${o.min}" max="${o.max}" value="${state.values[o.key]}" ${disabled}>`;
  } else if (o.type === 'multi') {
    control = o.choices.map(([v,l]) => `<label class="choice"><input type="checkbox" data-multi="${o.key}" value="${v}" ${state.values[o.key]?.includes(v) ? 'checked' : ''} ${disabled}>${escape(l)} · 0 ₽</label>`).join('');
  }
  return `<div class="option">${label}${price}<div class="option-controls">${control}</div></div>`;
}
function cardHTML(m, query) {
  const enabled = state.modules[m.id], total = moduleTotal(m, state);
  const paidOptions = m.options.filter(o => o.price);
  const optionsTotal = m.options.reduce((n,o) => n + o.price, 0);
  const control = m.core ? '<span class="chip">Ядро</span>' : toggle(`module-${m.id}`, enabled, `data-module="${m.id}" aria-label="${escape(m.label)}"`);
  let price = m.custom ? '<span class="module-price custom">Индивидуально</span>' : m.price ? `<span class="module-price">${money(m.price)} ₽ <small>/ мес</small></span>` : '<span class="module-price included">В базе · 0 ₽ доплаты</span>';
  let note = m.custom ? 'Вне общего итога' : enabled && total ? `В расчёте<br>${money(total)} ₽/мес` : paidOptions.length ? `Настройки<br>до +${money(optionsTotal)} ₽` : enabled ? 'Подключено' : '';
  let desc = m.description;
  if (m.id === 'bug_reports') desc = 'Отправка сообщений об ошибках разработчику. Плавающая кнопка и форма обратной связи.';
  if (m.id === 'treasury') desc += ' Требует модуль «Бухгалтерия».';
  const open = expanded || opened.has(m.id) || (query && m.options.some(o => `${o.label} ${o.desc || ''}`.toLowerCase().includes(query)));
  return `<article class="module-card ${enabled ? 'enabled' : ''} ${m.core ? 'core' : ''}" data-card="${m.id}"><div class="module-head"><span class="module-icon">${icon(m.group)}</span><h3>${escape(m.label)}</h3>${control}</div><p class="module-description">${escape(desc)}</p><div class="module-price-row">${price}<span class="module-selection">${note}</span></div>${m.options.length ? `<details class="options" data-details="${m.id}" ${open ? 'open' : ''}><summary><span>Настройки · ${m.options.length}${optionsTotal ? ` <span> / до +${money(optionsTotal)} ₽</span>` : ' / включены'}</span></summary>${!enabled ? '<p class="parent-hint">Включите модуль, чтобы выбрать настройки.</p>' : ''}<div class="option-list">${m.options.map(o => optionHTML(m,o)).join('')}</div></details>` : ''}</article>`;
}
function renderNav() {
  const groups = [['all','Все модули'], ...catalog.groups];
  $('categories').innerHTML = groups.map(([id,label]) => {
    const count = id === 'all' ? catalog.modules.length : catalog.modules.filter(m => m.group === id).length;
    return `<button data-category="${id}" class="${category === id ? 'active' : ''}" aria-pressed="${category === id}">${icon(id)}<span>${escape(label)}</span><span class="nav-count">${count}</span></button>`;
  }).join('');
}
function renderCatalog() {
  const query = $('search').value.trim().toLowerCase();
  let visible = 0;
  $('catalog').innerHTML = catalog.groups.map(([group, label]) => {
    const modules = catalog.modules.filter(m => {
      if (m.group !== group || category !== 'all' && group !== category) return false;
      if (filter === 'selected' && !state.modules[m.id]) return false;
      if (filter === 'paid' && !m.price && !m.custom && !m.options.some(o => o.price)) return false;
      return !query || `${m.label} ${m.description} ${m.options.map(o => `${o.label} ${o.desc || ''}`).join(' ')}`.toLowerCase().includes(query);
    }).sort((a,b) => Number(b.core) - Number(a.core));
    visible += modules.length;
    if (!modules.length) return '';
    const sum = catalog.modules.filter(m => m.group === group).reduce((n,m) => n + moduleTotal(m,state), 0);
    return `<section class="group" id="group-${group}"><div class="group-header"><h2>${escape(label)}</h2><span>${modules.length}</span><span class="group-sum">${sum ? `+${money(sum)} ₽/мес` : 'Включено в базу'}</span></div><div class="cards">${modules.map(m => cardHTML(m,query)).join('')}</div></section>`;
  }).join('');
  $('empty').hidden = visible > 0;
  $('catalog').setAttribute('aria-busy','false');
  document.querySelectorAll('[data-details]').forEach(details => details.addEventListener('toggle', () => {
    if (details.open) opened.add(details.dataset.details);
    else opened.delete(details.dataset.details);
  }));
  $('expand').textContent = expanded ? 'Свернуть настройки' : 'Раскрыть настройки';
}
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
  $('total-caption').textContent = bill.custom ? 'Подписка + индивидуальный расчёт складов' : 'Стоимость для одной компании';
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
  const response = await fetch('./catalog.json');
  if (!response.ok) throw new Error('catalog');
  catalog = await response.json();
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
  state = restore(catalog,saved);
  $('all-count').textContent = catalog.modules.length;
  renderNav(); renderCatalog(); renderQuote();
  $('search').addEventListener('input',renderCatalog);
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click',()=>{
    filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b=>{ b.classList.toggle('active',b===button); b.setAttribute('aria-pressed',String(b===button)); });
    renderCatalog();
  }));
  $('categories').addEventListener('click',e=>{
    const button = e.target.closest('[data-category]'); if (!button) return;
    category = button.dataset.category; renderNav(); renderCatalog(); $('search').scrollIntoView({block:'start'});
  });
  $('expand').addEventListener('click',()=>{expanded=!expanded;opened.clear();renderCatalog();});
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
  $('base-only').addEventListener('click',()=>{state=makeState(catalog);refresh();showToast('Оставлена база за 10 000 ₽/мес.');});
  $('choose-warehouses').addEventListener('click',()=>{state.modules.multiwarehouse=true;refresh();showToast('Мультисклад добавлен к запросу без изменения суммы.');});
  $('copy').addEventListener('click',copy);
}
init().catch(()=>{
  $('catalog').setAttribute('aria-busy','false');
  $('catalog').innerHTML='<p class="loading">Не удалось загрузить список модулей. Обновите страницу.</p>';
  $('full').disabled=true; $('base-only').disabled=true; $('copy').disabled=true; $('choose-warehouses').disabled=true;
});
