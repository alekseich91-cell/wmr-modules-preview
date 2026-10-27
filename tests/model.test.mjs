import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeState,calculate,setModule,setOption,restore,normalizeCalendar,moduleTotal} from '../model.js';
const c=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url)));
test('mandatory core 10,000; optional modules 36,000 and meaningful extras 4,000',()=>{
 const minimum=calculate(c,makeState(c));assert.equal(minimum.total,10000);assert.equal(minimum.core,10000);assert.equal(minimum.modules,0);assert.equal(minimum.options,0);
 const full=calculate(c,makeState(c,true));assert.equal(full.total,50000);assert.equal(full.core,10000);assert.equal(full.modules,36000);assert.equal(full.options,4000);
 assert.equal(full.items.reduce((n,i)=>n+i.price,0),50000);assert.ok(full.items.every(i=>i.price>0));assert.equal(c.modules.length,41);
});
test('only real registry core cards are permanent and cannot be bypassed by saved state',()=>{
 assert.deepEqual(c.modules.filter(m=>m.core).map(m=>m.id).sort(),['access','calendar','catalog','estimates','finance_rules']);
 const s=makeState(c);for(const m of c.modules.filter(m=>m.core)){assert.equal(s.modules[m.id],true);setModule(c,s,m.id,false);assert.equal(s.modules[m.id],true);}
 for(const key of ['calendar','estimates','catalog'])s.modules[key]=false;
 assert.equal(calculate(c,s).core,10000);const fixed=restore(c,s);assert.ok(fixed.modules.calendar&&fixed.modules.catalog&&fixed.modules.estimates);
});
test('removing optional parent removes its price and any active paid mode',()=>{
 for(const m of c.modules.filter(m=>!m.core&&!m.custom&&m.id!=='accounting')){
 const s=makeState(c,true),before=calculate(c,s).total,price=moduleTotal(m,s);
 setModule(c,s,m.id,false);assert.equal(before-calculate(c,s).total,price,m.id);
 }
});
test('free modules and ordinary controls have no surcharge and remain hideable',()=>{
 const s=makeState(c,true),before=calculate(c,s).total;
 for(const m of c.modules.filter(m=>!m.core&&!m.custom&&!m.price)){
  setModule(c,s,m.id,false);assert.equal(s.modules[m.id],false);assert.equal(calculate(c,s).total,before,m.id);
 }
 for(const m of c.modules)for(const o of m.options.filter(o=>o.type==='bool'&&!o.price)){
  setOption(s,o.key,!s.options[o.key]);assert.equal(calculate(c,s).total,before,o.key);
 }
 s.values.calendar_views=['month'];normalizeCalendar(s);assert.equal(calculate(c,s).total,before);
 assert.ok(!calculate(c,s).items.some(i=>i.id==='bug_reports'||i.id==='pdf_status_stamp'||i.id.startsWith('calendar_views.')));
});
test('manual is free, scanner costs 1,000, hybrid costs 1,500 over module price',()=>{
 const s=makeState(c);setModule(c,s,'acceptance',true);const bare=calculate(c,s).total;assert.equal(bare,11000);
 s.values.warehouse_input_mode='scanner';assert.equal(calculate(c,s).total-bare,1000);
 s.values.warehouse_input_mode='hybrid';assert.equal(calculate(c,s).total-bare,1500);
 s.values.warehouse_input_mode='manual';assert.equal(calculate(c,s).total,bare);
 setModule(c,s,'acceptance',false);s.values.warehouse_input_mode='hybrid';assert.equal(calculate(c,s).total,10000);
});
test('only lightplot and rider tools are charged independently among boolean options',()=>{
 const paid=c.modules.flatMap(m=>m.options.filter(o=>o.type==='bool'&&o.price));assert.deepEqual(paid.map(o=>o.key).sort(),['lightplots','riders']);
 const s=makeState(c);setOption(s,'lightplots',true);assert.equal(calculate(c,s).total,11500);setOption(s,'riders',true);assert.equal(calculate(c,s).total,12500);
 setOption(s,'pdf_status_stamp',true);setOption(s,'equipment_labels',true);setOption(s,'proebot',true);assert.equal(calculate(c,s).total,12500);
});
test('timesheet, agreed price and amount-edit rights are compatible and independent',()=>{
 const s=makeState(c,true);
 assert.equal(s.options.staff_rate_agreement,true);assert.equal(s.options.staff_timesheet,true);
 setOption(s,'staff_timesheet',false);assert.equal(s.options.staff_rate_agreement,true);assert.equal(s.options.payroll_manager_only,true);
 setOption(s,'staff_timesheet',true);assert.equal(s.options.staff_rate_agreement,true);
 setOption(s,'staff_rate_agreement',false);assert.equal(s.options.staff_timesheet,true);assert.equal(s.options.payroll_manager_only,true);
 assert.equal(calculate(c,s).total,50000);
 const restored=restore(c,JSON.parse(JSON.stringify(s)));assert.equal(restored.options.payroll_manager_only,true);assert.equal(restored.options.staff_rate_agreement,false);
});
test('new independent modules and relocated controls match current branch',()=>{
 const byId=Object.fromEntries(c.modules.map(m=>[m.id,m]));
 for(const id of ['scene3d','project_journal','snapshots','project_timing','load_planner','pdf_templates','stock_reserve','brigadier_tasks','access','finance_rules'])assert.ok(byId[id],id);
 assert.ok(byId.access.options.some(o=>o.key==='qr_login_enabled'));assert.ok(!byId.smart_loading.options.some(o=>o.key==='qr_login_enabled'));
 assert.ok(byId.finance_rules.options.some(o=>o.key==='manager_percent_enabled'));assert.ok(!byId.accounting.options.some(o=>o.key==='manager_percent_enabled'));
 assert.ok(byId.catalog.options.some(o=>o.key==='label_format_default'));
 const s=makeState(c,true);const before=calculate(c,s).total;
 setModule(c,s,'scene3d',false);assert.equal(s.modules.layher,true);assert.equal(calculate(c,s).total,before-byId.scene3d.price);
 setModule(c,s,'stock_reserve',false);assert.equal(s.modules.brigadier_tasks,true);
 for(const id of ['project_journal','snapshots','load_planner'])assert.equal(byId[id].price,0);
});
test('staff calendar has one visible calendar choice and synchronized legacy state',()=>{
 const s=makeState(c,true);s.values.calendar_views=['month'];normalizeCalendar(s);assert.equal(s.options.staff_staff_calendar,false);
 s.values.calendar_views.push('staff');normalizeCalendar(s);assert.equal(s.options.staff_staff_calendar,true);
 const hidden=c.modules.find(m=>m.id==='staff').options.find(o=>o.key==='staff_staff_calendar');assert.equal(hidden.hidden,true);
});
test('treasury dependency, multiwarehouse quote and normalized persistence',()=>{
 const s=makeState(c);setModule(c,s,'multiwarehouse',true);assert.equal(calculate(c,s).total,10000);assert.equal(calculate(c,s).custom,true);
 setModule(c,s,'treasury',true);assert.equal(s.modules.accounting,true);assert.equal(calculate(c,s).total,14000);
 setModule(c,s,'accounting',false);assert.equal(s.modules.treasury,false);assert.equal(calculate(c,s).total,10000);
 const full=makeState(c,true);assert.deepEqual(restore(c,JSON.parse(JSON.stringify(full))),full);
 const bad=restore(c,{modules:{calendar:false},values:{warehouse_input_mode:'fake',calendar_views:[],timezone:'fake'}});assert.equal(bad.modules.calendar,true);assert.equal(bad.values.warehouse_input_mode,'manual');assert.equal(bad.values.timezone,'Europe/Moscow');
});

test('generated catalog matches the pinned source and separate price policy',async()=>{
 const provenance=JSON.parse(await readFile(new URL('../source-reference.json',import.meta.url)));
 const policy=JSON.parse(await readFile(new URL('../pricing-policy.json',import.meta.url)));
 const markup=await readFile(new URL('../modules-original.html',import.meta.url),'utf8');
 assert.equal(c.sourceCommit,provenance.source_commit);assert.equal(c.version,policy.version);
 assert.deepEqual([...markup.matchAll(/data-module="([^"]+)"/g)].map(m=>m[1]).sort(),c.modules.filter(m=>m.id!=='mobile').map(m=>m.id).sort());
 for(const m of c.modules)assert.equal(m.price,policy.prices[m.id],m.id);
 assert.equal(c.modules.reduce((n,m)=>n+m.options.length,0),47);
});
