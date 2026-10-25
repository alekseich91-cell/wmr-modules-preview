import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('..',import.meta.url));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.woff':'font/woff'};
test('original module form: prices, modes, filtering, saved choices, copy, both themes and mobile',async()=>{
 const server=createServer(async(req,res)=>{
  const file=path.join(root,req.url==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[path.extname(file)]||'text/plain');res.end(await readFile(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
 browser=await chromium.launch({headless:true,...(process.env.WMR_PREVIEW_CHROME?{executablePath:process.env.WMR_PREVIEW_CHROME}:{})});
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.WMR_PREVIEW_URL||`http://127.0.0.1:${server.address().port}`);
 await page.locator('#modulesForm [data-card]').first().waitFor();
 assert.equal(await page.locator('#modulesForm [data-card]').count(),31);
 assert.equal(await page.locator('#modulesForm .form-check-input').count()>60,true);
 const total=async()=>Number((await page.locator('#total').innerText()).replace(/\D/g,''));
 assert.equal(await total(),50000);
 assert.equal(await page.locator('#opt-warehouse_input_mode').inputValue(),'hybrid');
 await page.locator('#clear-all').click();assert.equal(await total(),0);
 await page.locator('#module-estimates').check();assert.equal(await total(),2600);
 await page.locator('#opt-lightplots').check();assert.equal(await total(),3800);
 await page.locator('#module-estimates').uncheck();assert.equal(await total(),0);
 await page.locator('#module-acceptance').check();assert.equal(await total(),1500);
 await page.locator('#opt-warehouse_input_mode').selectOption('scanner');assert.equal(await total(),2500);
 await page.locator('#opt-warehouse_input_mode').selectOption('hybrid');assert.equal(await total(),3000);
 await page.locator('#opt-warehouse_input_mode').selectOption('manual');assert.equal(await total(),1500);
 await page.locator('#module-acceptance').uncheck();assert.equal(await total(),0);
 await page.locator('#module-calendar').check();assert.equal(await total(),2100);
 await page.locator('[data-multi="calendar_views"][value="gantt"]').check();assert.equal(await total(),2600);
 await page.locator('#module-calendar').uncheck();assert.equal(await total(),0);
 await page.reload();await page.locator('[data-card]').first().waitFor();assert.equal(await total(),0);
 await page.locator('#full').click();assert.equal(await total(),50000);
 await page.locator('#choose-warehouses').click();assert.equal(await total(),50000);assert.equal(await page.locator('#custom-note').isVisible(),true);
 await page.locator('#search').fill('Промокоды');assert.equal(await page.locator('[data-card]:visible').count(),1);
 await page.locator('#search').fill('НетТакогоМодуля');assert.equal(await page.locator('#empty').isVisible(),true);
 await page.locator('#clear-filters').click();assert.equal(await page.locator('[data-card]:visible').count(),31);
 await page.locator('#category-filter').selectOption('warehouse');assert.equal(await page.locator('[data-card]:visible').count(),8);
 await page.locator('#category-filter').selectOption('all');
 await page.locator('#modSaveBtn').click();assert.match(await page.locator('#modSaveMsg').innerText(),/Сохранено/);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>scrollTo(0,0));await page.locator('#toast').evaluate(el=>el.classList.remove('visible'));
 await mkdir(path.join(root,'test-results'),{recursive:true});
 await page.screenshot({path:path.join(root,'test-results/desktop.png'),fullPage:false});
 await page.locator('#theme-toggle').click();await page.screenshot({path:path.join(root,'test-results/dark.png'),fullPage:false});
 assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('dark')),true);
 await page.locator('#theme-toggle').click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'test-results/mobile.png'),fullPage:false});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#opt-staff_rate_agreement').check();assert.equal(await page.locator('#opt-staff_timesheet').isChecked(),false);assert.equal(await total(),49800);
 await page.locator('#opt-payroll_manager_only').check();assert.equal(await total(),50000);
 await page.locator('#opt-timezone').selectOption('Asia/Vladivostok');assert.equal(await total(),50000);
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);await page.locator('#copy').click();
 const clipboard=await page.evaluate(()=>navigator.clipboard.readText());assert.match(clipboard,/50.?000 ₽/);assert.match(clipboard,/Владивосток/);assert.match(clipboard,/Гибридный/);
 await page.reload();await page.locator('[data-card]').first().waitFor();assert.equal(await page.locator('#opt-timezone').inputValue(),'Asia/Vladivostok');assert.equal(await total(),50000);
 await page.setViewportSize({width:320,height:740});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});
