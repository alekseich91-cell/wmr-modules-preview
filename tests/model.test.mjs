import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeState,calculate,setModule,setOption,restore,normalizeCalendar,moduleTotal} from '../model.js';
const c=JSON.parse(await readFile(new URL('../catalog.json',import.meta.url)));
test('nothing selected costs zero; complete valid configuration costs exactly 50,000',()=>{
 assert.equal(c.base,0);assert.equal(calculate(c,makeState(c)).total,0);
 const bill=calculate(c,makeState(c,true));assert.equal(bill.total,50000);
 assert.equal(bill.items.reduce((n,i)=>n+i.price,0),50000);assert.ok(!bill.items.some(i=>i.id==='base'));
 assert.equal(c.modules.length,31);
 for(const m of c.modules.filter(m=>!m.custom))assert.ok(m.price>0,m.id);
});
test('former base cards can each be bought and disabled independently',()=>{
 for(const id of ['calendar','estimates','catalog']){
 const s=makeState(c);setModule(c,s,id,true);
 assert.ok(calculate(c,s).total>0);assert.equal(Object.values(s.modules).filter(Boolean).length,1);
 setModule(c,s,id,false);assert.equal(calculate(c,s).total,0);
 }
});
test('disabling each parent removes all its fees including mode and calendar views',()=>{
 for(const m of c.modules.filter(m=>!m.custom&&m.id!=='accounting')){
 const s=makeState(c,true),before=calculate(c,s).total,price=moduleTotal(m,s);
 setModule(c,s,m.id,false);assert.equal(before-calculate(c,s).total,price,m.id);
 }
});
test('manual is free, scanner costs 1,000, hybrid costs 1,500; no duplicate HID checkbox',()=>{
 const s=makeState(c);setModule(c,s,'acceptance',true);
 const bare=calculate(c,s).total;
 assert.equal(s.values.warehouse_input_mode,'manual');
 s.values.warehouse_input_mode='scanner';assert.equal(calculate(c,s).total-bare,1000);
 s.values.warehouse_input_mode='hybrid';assert.equal(calculate(c,s).total-bare,1500);
 s.values.warehouse_input_mode='manual';assert.equal(calculate(c,s).total,bare);
 setModule(c,s,'acceptance',false);s.values.warehouse_input_mode='hybrid';assert.equal(calculate(c,s).total,0);
 assert.ok(!c.modules.find(m=>m.id==='acceptance').options.some(o=>o.key==='scanner_mode_enabled'));
});
test('calendar view fees are individual; display settings do not change price',()=>{
 const s=makeState(c);setModule(c,s,'calendar',true);
 const before=calculate(c,s).total;
 s.values.calendar_views.push('gantt');assert.equal(calculate(c,s).total-before,500);
 s.values.timezone='Asia/Vladivostok';s.values.calendar_default_view='gantt';assert.equal(calculate(c,s).total-before,500);
 s.values.calendar_views=['week'];normalizeCalendar(s);assert.equal(s.values.calendar_default_view,'week');
});
test('paid options are never billed while parent is off',()=>{
 const s=makeState(c);
 for(const m of c.modules)for(const o of m.options.filter(o=>o.type==='bool'))setOption(s,o.key,true);
 assert.equal(calculate(c,s).total,0);
});
test('mutually exclusive pay modes and paid dependency do not double charge',()=>{
 const s=makeState(c,true);setOption(s,'staff_rate_agreement',true);
 assert.equal(s.options.staff_timesheet,false);assert.equal(s.options.payroll_manager_only,false);assert.equal(calculate(c,s).total,49800);
 setOption(s,'payroll_manager_only',true);assert.equal(s.options.staff_timesheet,true);assert.equal(s.options.staff_rate_agreement,false);assert.equal(calculate(c,s).total,50000);
});
test('warehouse individual quote and treasury dependency',()=>{
 const s=makeState(c);setModule(c,s,'multiwarehouse',true);assert.equal(calculate(c,s).total,0);assert.equal(calculate(c,s).custom,true);
 setModule(c,s,'treasury',true);assert.equal(s.modules.accounting,true);assert.equal(calculate(c,s).total,3500);
 setModule(c,s,'accounting',false);assert.equal(s.modules.treasury,false);assert.equal(calculate(c,s).total,0);
});
test('restoring empty stays empty and rejects unsupported mode prices and malformed choices',()=>{
 assert.equal(calculate(c,restore(c,makeState(c))).total,0);
 const full=makeState(c,true);assert.deepEqual(restore(c,JSON.parse(JSON.stringify(full))),full);
 const s=restore(c,{modules:{calendar:false,treasury:true},values:{warehouse_input_mode:'fake',calendar_views:[],timezone:'fake'},options:{lightplots:'true'}});
 assert.equal(s.modules.calendar,false);assert.equal(s.modules.accounting,true);assert.equal(s.values.warehouse_input_mode,'manual');assert.equal(s.values.timezone,'Europe/Moscow');assert.equal(s.options.lightplots,false);
});
