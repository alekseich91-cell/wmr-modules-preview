export const DEPENDENCIES = {treasury: ['accounting']};
const modes = ['staff_rate_agreement', 'staff_timesheet'];

export function makeState(catalog, full = false) {
  const state = {modules: {}, options: {}, values: {}};
  for (const m of catalog.modules) {
    state.modules[m.id] = m.core || (!m.custom && (full || m.price === 0));
    for (const o of m.options) {
      if (o.type === 'bool') state.options[o.key] = full || (o.price === 0 && o.default !== false);
      else if (o.type === 'multi') state.values[o.key] = o.choices.map(c => c[0]);
      else if (o.type === 'select') state.values[o.key] = o.key === 'timezone' ? 'Europe/Moscow' : o.choices?.[0]?.[0];
      else state.values[o.key] = o.min ?? 1;
    }
  }
  state.options.staff_rate_agreement = false;
  if (!state.options.staff_timesheet) state.options.payroll_manager_only = false;
  return state;
}

export function setModule(catalog, state, id, enabled) {
  const m = catalog.modules.find(m => m.id === id);
  if (!m || m.core) return [];
  const notices = [];
  state.modules[id] = enabled;
  if (enabled) for (const dependency of DEPENDENCIES[id] || []) {
    if (!state.modules[dependency]) {
      state.modules[dependency] = true;
      notices.push('Включена «Бухгалтерия»: она нужна для Казны.');
    }
  }
  else for (const [dependent, dependencies] of Object.entries(DEPENDENCIES)) {
    if (dependencies.includes(id) && state.modules[dependent]) {
      state.modules[dependent] = false;
      notices.push('Казна выключена вместе с Бухгалтерией.');
    }
  }
  return notices;
}

export function setOption(state, key, enabled) {
  state.options[key] = enabled;
  if (enabled && modes.includes(key)) {
    state.options[modes.find(m => m !== key)] = false;
  }
  if (key === 'payroll_manager_only' && enabled) {
    state.options.staff_timesheet = true;
    state.options.staff_rate_agreement = false;
  }
  if (!state.options.staff_timesheet) state.options.payroll_manager_only = false;
}

export function moduleTotal(m, state) {
  if (!state.modules[m.id] || m.custom) return 0;
  return m.price + m.options.reduce((sum, o) => sum + (state.options[o.key] ? o.price : 0), 0);
}

export function calculate(catalog, state) {
  const items = [{id:'base', label:'База WMR', price:catalog.base}];
  let options = 0, modules = 0;
  for (const m of catalog.modules) {
    if (!state.modules[m.id] || m.custom) continue;
    if (m.price) { modules += m.price; items.push({id:m.id, label:m.label, price:m.price}); }
    for (const o of m.options) if (o.price && state.options[o.key]) {
      options += o.price;
      items.push({id:o.key, label:o.label, price:o.price, parent:m.label});
    }
  }
  return {total:catalog.base + modules + options, modules, options, items, custom:!!state.modules.multiwarehouse};
}

export function restore(catalog, saved) {
  const state = makeState(catalog);
  if (!saved || typeof saved !== 'object') return state;
  for (const m of catalog.modules) {
    if (!m.core && typeof saved.modules?.[m.id] === 'boolean') state.modules[m.id] = saved.modules[m.id];
    for (const o of m.options) {
      if (o.type === 'bool' && typeof saved.options?.[o.key] === 'boolean') state.options[o.key] = saved.options[o.key];
      const value = saved.values?.[o.key];
      if (o.type === 'select' && o.choices?.some(c => c[0] === value)) state.values[o.key] = value;
      if (o.type === 'multi' && Array.isArray(value)) {
        const selected = o.choices.map(c => c[0]).filter(k => value.includes(k));
        if (selected.length) state.values[o.key] = selected;
      }
      if (o.type === 'int' && Number.isInteger(value) && value >= o.min && value <= o.max) state.values[o.key] = value;
    }
  }
  if (state.options.staff_timesheet) state.options.staff_rate_agreement = false;
  if (!state.options.staff_timesheet) state.options.payroll_manager_only = false;
  for (const [id, deps] of Object.entries(DEPENDENCIES)) if (state.modules[id]) for (const dep of deps) state.modules[dep] = true;
  normalizeCalendar(state);
  return state;
}

export function normalizeCalendar(state) {
  const views = state.values.calendar_views;
  if (!views?.length) state.values.calendar_views = ['month'];
  if (!state.values.calendar_views.includes(state.values.calendar_default_view)) state.values.calendar_default_view = state.values.calendar_views[0];
}
