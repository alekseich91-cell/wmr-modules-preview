import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeState,calculate,setModule,setOption,restore,normalizeCalendar,moduleTotal} from '../model.js';
const c=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url)));
const byId=Object.fromEntries(c.modules.map(m=>[m.id,m]));
const options=Object.fromEntries(c.modules.flatMap(m=>m.options.map(o=>[o.key,o])));
test('accepted owner prices are applied without balancing to an arbitrary target',()=>{
 const requested={calendar:2000,project_journal:500,project_timing:0,estimates:3000,snapshots:500,catalog:0,repairs:1000,staff:2000,subrent:1500,trusted_providers:1500,notifications:500,alerts:500,presence:150};
 for(const [id,price]of Object.entries(requested))assert.equal(byId[id].price,price,id);
 const requestedOptions={proebot:1000,foreign_scan_labels:500,staff_planner:1000,staff_summary:500,staff_timesheet:1000,staff_brief:1000,counterparty_netting:500};
 for(const [id,price]of Object.entries(requestedOptions))assert.equal(options[id].price,price,id);
 assert.deepEqual(options.calendar_views.choicePrices,{month:0,week:0,list:0,gantt:0,staff:500});
 const min=calculate(c,makeState(c));assert.equal(min.total,5000);assert.equal(min.core,5000);assert.equal(min.options,0);
 const full=calculate(c,makeState(c,true));assert.equal(full.total,49400);assert.equal(c.full,49400);assert.equal(full.core,5000);assert.equal(full.modules,34400);assert.equal(full.options,10000);
 assert.equal(full.items.reduce((n,i)=>n+i.price,0),49400);assert.ok(full.items.every(i=>i.price>0));
});
test('technical core remains permanent, including free catalog, access and finance rules',()=>{
 assert.deepEqual(c.modules.filter(m=>m.core).map(m=>m.id).sort(),['access','calendar','catalog','estimates','finance_rules']);
 const s=makeState(c);for(const m of c.modules.filter(m=>m.core)){setModule(c,s,m.id,false);assert.equal(s.modules[m.id],true);s.modules[m.id]=false;}
 assert.equal(calculate(c,s).core,5000);const fixed=restore(c,s);for(const m of c.modules.filter(m=>m.core))assert.equal(fixed.modules[m.id],true);
});
test('staff calendar billed once, only with staff module, and ordinary calendar views are free',()=>{
 const s=makeState(c);s.values.calendar_views=['month','staff'];normalizeCalendar(s);
 assert.equal(calculate(c,s).total,5000);setModule(c,s,'staff',true);assert.equal(calculate(c,s).total,7500);
 assert.equal(calculate(c,s).items.filter(i=>i.id==='calendar_views.staff').length,1);assert.ok(!calculate(c,s).items.some(i=>i.id==='staff_staff_calendar'));
 for(const view of ['week','list','gantt']){s.values.calendar_views.push(view);normalizeCalendar(s);assert.equal(calculate(c,s).total,7500);}
 setModule(c,s,'staff',false);assert.equal(calculate(c,s).total,5000);assert.equal(s.values.calendar_default_view,'month');
 s.values.calendar_views=['staff'];s.values.calendar_default_view='staff';normalizeCalendar(s);assert.ok(s.values.calendar_views.includes('month'));assert.equal(s.values.calendar_default_view,'month');
});
test('disabling paid parent removes its options and dependent staff calendar',()=>{
 for(const m of c.modules.filter(m=>!m.core&&!m.custom&&m.id!=='accounting')){
 const s=makeState(c,true),before=calculate(c,s).total,price=moduleTotal(m,s)+(m.id==='staff'?500:0);
 setModule(c,s,m.id,false);assert.equal(before-calculate(c,s).total,price,m.id);
 }
});
test('staff base and paid tools can be selected independently and have additive prices',()=>{
 const s=makeState(c);setModule(c,s,'staff',true);assert.equal(calculate(c,s).total,7000);
 for(const [key,total]of [['staff_planner',8000],['staff_summary',8500],['staff_timesheet',9500],['staff_brief',10500]]){setOption(s,key,true);assert.equal(calculate(c,s).total,total,key);}
 setOption(s,'staff_rate_agreement',true);setOption(s,'payroll_manager_only',true);assert.equal(calculate(c,s).total,10500);
 setOption(s,'staff_timesheet',false);assert.equal(calculate(c,s).total,9500);assert.equal(s.options.staff_rate_agreement,true);assert.equal(s.options.payroll_manager_only,true);
 setModule(c,s,'staff',false);assert.equal(calculate(c,s).total,5000);
});
test('estimate tools, Revisor and foreign labels are independently priced',()=>{
 const s=makeState(c);for(const [key,total]of [['lightplots',6500],['riders',7500],['proebot',8500],['foreign_scan_labels',9000]]){setOption(s,key,true);assert.equal(calculate(c,s).total,total,key);}
 setOption(s,'pdf_status_stamp',true);setOption(s,'equipment_labels',true);assert.equal(calculate(c,s).total,9000);
});
test('netting costs 500 only while accounting is enabled',()=>{
 const s=makeState(c);setOption(s,'counterparty_netting',true);assert.equal(calculate(c,s).total,5000);
 setModule(c,s,'accounting',true);assert.equal(calculate(c,s).total,8000);setModule(c,s,'accounting',false);assert.equal(calculate(c,s).total,5000);
});
test('free experimental timing and UI preferences do not add charges',()=>{
 const s=makeState(c,true),before=calculate(c,s).total;
 for(const m of c.modules.filter(m=>!m.core&&!m.custom&&!m.price)){setModule(c,s,m.id,false);assert.equal(calculate(c,s).total,before,m.id);}
 for(const m of c.modules)for(const o of m.options.filter(o=>o.type==='bool'&&!o.price&&!o.hidden)){setOption(s,o.key,!s.options[o.key]);assert.equal(calculate(c,s).total,before,o.key);}
 assert.equal(byId.project_timing.price,0);assert.ok(!calculate(c,s).items.some(i=>i.id==='project_timing'||i.id==='pdf_status_stamp'));
});
test('manual mode free; scanner +1000 and hybrid +1500 over enabled acceptance',()=>{
 const s=makeState(c);setModule(c,s,'acceptance',true);assert.equal(calculate(c,s).total,6000);
 s.values.warehouse_input_mode='scanner';assert.equal(calculate(c,s).total,7000);
 s.values.warehouse_input_mode='hybrid';assert.equal(calculate(c,s).total,7500);
 s.values.warehouse_input_mode='manual';assert.equal(calculate(c,s).total,6000);
 setModule(c,s,'acceptance',false);s.values.warehouse_input_mode='hybrid';assert.equal(calculate(c,s).total,5000);
});
test('current source grouping and independently enabled features are preserved',()=>{
 assert.equal(c.modules.length,41);for(const id of ['scene3d','project_journal','snapshots','project_timing','load_planner','pdf_templates','stock_reserve','brigadier_tasks','access','finance_rules'])assert.ok(byId[id],id);
 assert.ok(byId.access.options.some(o=>o.key==='qr_login_enabled'));assert.ok(byId.finance_rules.options.some(o=>o.key==='manager_percent_enabled'));assert.ok(byId.catalog.options.some(o=>o.key==='label_format_default'));
 const s=makeState(c,true);setModule(c,s,'scene3d',false);assert.equal(s.modules.layher,true);setModule(c,s,'stock_reserve',false);assert.equal(s.modules.brigadier_tasks,true);
});
test('treasury dependency, individual warehouse quote and safe restoration',()=>{
 const s=makeState(c);setModule(c,s,'multiwarehouse',true);assert.equal(calculate(c,s).total,5000);assert.equal(calculate(c,s).custom,true);
 setModule(c,s,'treasury',true);assert.equal(calculate(c,s).total,9000);assert.equal(s.modules.accounting,true);setModule(c,s,'accounting',false);assert.equal(s.modules.treasury,false);
 const full=makeState(c,true);assert.deepEqual(restore(c,JSON.parse(JSON.stringify(full))),full);
 const restored=restore(c,{modules:{calendar:false},values:{warehouse_input_mode:'fake',calendar_views:[],timezone:'fake'}});assert.equal(restored.modules.calendar,true);assert.equal(restored.values.warehouse_input_mode,'manual');assert.equal(restored.values.timezone,'Europe/Moscow');
});
test('new wording is rendered in the source template and preserved on regeneration',async()=>{
 assert.equal(options.lightplots.label,'Автоматическое распознавание лайтплотов');assert.equal(options.riders.label,'Инструмент для заполнения оферов в Excel');
 assert.match(byId.estimates.description,/резервирован/);assert.match(byId.trusted_providers.label,/совладение оборудованием/);assert.match(byId.subrent.description,/хаб/);assert.match(byId.discussion.description,/Заказчик/);assert.match(options.staff_planner.desc,/нескольким проектам/);assert.match(byId.alerts.description,/физических рисков/);assert.doesNotMatch(byId.smart_loading.note,/уменьшен/);
 const provenance=JSON.parse(await readFile(new URL('../source-reference.json',import.meta.url))),policy=JSON.parse(await readFile(new URL('../pricing-policy.json',import.meta.url))),markup=await readFile(new URL('../modules-original.html',import.meta.url),'utf8');
 assert.equal(c.sourceCommit,provenance.source_commit);assert.equal(c.version,policy.version);assert.ok(!('full'in policy));
 assert.deepEqual([...markup.matchAll(/data-module="([^"]+)"/g)].map(m=>m[1]).sort(),c.modules.filter(m=>m.id!=='mobile').map(m=>m.id).sort());
 for(const m of c.modules)assert.equal(m.price,policy.prices[m.id],m.id);assert.ok(markup.includes(options.lightplots.label)&&markup.includes(options.riders.label)&&markup.includes(byId.trusted_providers.label));
 assert.equal(c.modules.reduce((n,m)=>n+m.options.length,0),47);
});
