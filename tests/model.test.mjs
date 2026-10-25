import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeState,calculate,setModule,setOption,restore,normalizeCalendar} from '../model.js';
const c=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url)));
test('base 10,000 and every available paid item exactly 50,000',()=>{
 assert.equal(calculate(c,makeState(c)).total,10000);
 const bill=calculate(c,makeState(c,true));
 assert.equal(bill.total,50000);assert.equal(bill.modules,32000);assert.equal(bill.options,8000);
 assert.equal(c.modules.length,31);assert.equal(new Set(c.modules.map(m=>m.id)).size,31);
 for(const m of c.modules){assert.ok(Number.isInteger(m.price)&&m.price>=0);for(const o of m.options)assert.ok(Number.isInteger(o.price)&&o.price>=0);}
});
test('switching each parent removes exactly its own price and active options',()=>{
 for(const m of c.modules.filter(m=>!m.core&&!m.custom&&m.id!=='accounting')){
 const s=makeState(c,true), before=calculate(c,s).total;
 setModule(c,s,m.id,false);
 assert.equal(before-calculate(c,s).total,m.price+m.options.reduce((n,o)=>n+(s.options[o.key]?o.price:0),0),m.id);
 }
});
test('each paid option is charged only with enabled parent',()=>{
 for(const m of c.modules)for(const o of m.options.filter(o=>o.price)){
 const s=makeState(c);setModule(c,s,m.id,true);const before=calculate(c,s).total;
 setOption(s,o.key,true);assert.equal(calculate(c,s).total-before,o.price,o.key);
 if(!m.core){setModule(c,s,m.id,false);assert.ok(!calculate(c,s).items.some(i=>i.id===o.key));}
 }
});
test('warehouse quote never silently contributes zero-price access or changes numeric sum',()=>{
 const s=makeState(c,true);setModule(c,s,'multiwarehouse',true);
 assert.equal(calculate(c,s).total,50000);assert.equal(calculate(c,s).custom,true);
});
test('treasury brings accounting and its disable cascades',()=>{
 const s=makeState(c);setModule(c,s,'treasury',true);
 assert.equal(s.modules.accounting,true);assert.equal(calculate(c,s).total,14500);
 setModule(c,s,'accounting',false);assert.equal(s.modules.treasury,false);assert.equal(calculate(c,s).total,10000);
});
test('payment modes and manager-only dependency preserve total',()=>{
 const s=makeState(c,true);setOption(s,'staff_rate_agreement',true);
 assert.equal(s.options.staff_timesheet,false);assert.equal(s.options.payroll_manager_only,false);assert.equal(calculate(c,s).total,50000);
 setOption(s,'payroll_manager_only',true);assert.equal(s.options.staff_timesheet,true);assert.equal(s.options.staff_rate_agreement,false);
});
test('persisted data is normalized; unknown keys, bad values and free pricing cannot be injected',()=>{
 const s=restore(c,{modules:{calendar:false,treasury:true},options:{lightplots:'true'},values:{timezone:'bad',calendar_views:[],alert_horizon_days:-2}});
 assert.equal(s.modules.calendar,true);assert.equal(s.modules.accounting,true);assert.equal(s.options.lightplots,false);
 assert.equal(s.values.timezone,'Europe/Moscow');assert.ok(s.values.calendar_views.length);
 const full=makeState(c,true);assert.deepEqual(restore(c,JSON.parse(JSON.stringify(full))),full);
});
test('calendar default stays among selected views',()=>{
 const s=makeState(c);s.values.calendar_views=['week'];normalizeCalendar(s);assert.equal(s.values.calendar_default_view,'week');
 s.values.calendar_views=[];normalizeCalendar(s);assert.deepEqual(s.values.calendar_views,['month']);
});
