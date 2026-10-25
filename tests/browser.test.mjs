import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('..',import.meta.url));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
test('desktop and mobile: totals, dependencies, search, persistence, options and overflow',async()=>{
 const server=createServer(async(req,res)=>{
  const file=path.join(root,req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');res.end(await readFile(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.WMR_PREVIEW_CHROME?{executablePath:process.env.WMR_PREVIEW_CHROME}:{})});
 try{
 const page=await browser.newPage({viewport:{width:1512,height:1100}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.locator('[data-card]').first().waitFor();
 assert.equal(await page.locator('[data-card]').count(),31);
 const total=async()=>Number((await page.locator('#total').innerText()).replace(/\D/g,''));
 assert.equal(await total(),10000);
 await page.locator('#full').click();assert.equal(await total(),50000);
 await page.locator('#expand').click();
 await page.locator('#opt-lightplots').uncheck();assert.equal(await total(),48500);
 await page.locator('#opt-lightplots').check();
 await page.locator('#module-staff').uncheck();assert.equal(await total(),45500);
 await page.locator('#module-staff').check();assert.equal(await total(),50000);
 await page.locator('#choose-warehouses').click();assert.equal(await total(),50000);assert.equal(await page.locator('#custom-note').isVisible(),true);
 await page.reload();await page.locator('[data-card]').first().waitFor();assert.equal(await total(),50000);assert.equal(await page.locator('#custom-note').isVisible(),true);
 await page.locator('#search').fill('Промокоды');assert.equal(await page.locator('[data-card]').count(),1);assert.equal(await page.locator('#opt-showcase_promo').isVisible(),true);
 await page.locator('#search').fill('НетТакогоМодуля');assert.equal(await page.locator('#empty').isVisible(),true);
 await page.locator('#clear-filters').click();assert.equal(await page.locator('[data-card]').count(),31);
 await page.locator('#base-only').click();assert.equal(await total(),10000);
 await page.locator('#module-treasury').check();assert.equal(await page.locator('#module-accounting').isChecked(),true);assert.equal(await total(),14500);
 await page.locator('#module-accounting').uncheck();assert.equal(await page.locator('#module-treasury').isChecked(),false);assert.equal(await total(),10000);
 await page.locator('#full').click();
 await mkdir(path.join(root,'test-results'),{recursive:true});
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.locator('#toast').evaluate(el=>el.classList.remove('visible'));
 await page.screenshot({path:path.join(root,'test-results/desktop.png'),fullPage:false});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(root,'test-results/mobile.png'),fullPage:false});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal(await page.locator('.mobile-total').isVisible(),true);
 await page.locator('#expand').click();
 await page.locator('#opt-staff_rate_agreement').check();assert.equal(await page.locator('#opt-staff_timesheet').isChecked(),false);assert.equal(await total(),50000);
 await page.locator('#opt-payroll_manager_only').check();assert.equal(await page.locator('#opt-staff_timesheet').isChecked(),true);
 await page.locator('#opt-timezone').selectOption('Asia/Vladivostok');assert.equal(await total(),50000);
 await page.reload();await page.locator('[data-card]').first().waitFor();
 await page.locator('[data-details="calendar"]').evaluate(el=>el.open=true);assert.equal(await page.locator('#opt-timezone').inputValue(),'Asia/Vladivostok');
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await page.locator('#copy').click();
 const clipboard=await page.evaluate(()=>navigator.clipboard.readText());
 assert.match(clipboard,/50.?000 ₽/);assert.match(clipboard,/Владивосток/);
 await page.setViewportSize({width:320,height:740});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
