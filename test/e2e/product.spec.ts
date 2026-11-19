import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile,mkdir} from 'node:fs/promises';
import {scenarioBundle,verifyBundle} from '../../packages/core/src/index.js';

test.beforeEach(async({page})=>{await page.route('https://forno.celo-sepolia.celo-testnet.org/**',route=>route.abort());await page.route('https://forno.celo.org/**',route=>route.abort());});
test('all product routes work without overflow or page exceptions',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  for(const route of ['/','/explorer','/lab','/studio','/journal','/vault','/developers','/grant','/about/methodology','/story']){
    await page.goto(route);await expect(page.locator('h1')).toBeVisible();await expect(page.locator('body')).not.toContainText('workspace interrupted');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);await page.goto('/');await page.waitForTimeout(200);
  await mkdir('docs/screenshots',{recursive:true});await page.screenshot({path:`docs/screenshots/${info.project.name}.png`,fullPage:true});
});
test('sample trace separates money, work and authority and exports exact evidence',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open paid-but-not-delivered case'}).click();await expect(page).toHaveURL(/explorer/);
  const workspace=page.locator('.trace-workspace');await expect(workspace).toContainText('SETTLED');await expect(workspace).toContainText('TESTED FAIL');await expect(workspace).toContainText('NOT PROVIDED');
  const event=await Promise.all([page.waitForEvent('download'),workspace.getByRole('button',{name:'Download manifest'}).click()]);const path=await event[0].path();const bundle=JSON.parse(await readFile(path!,'utf8'));expect((await verifyBundle(bundle)).integrity).toBe('VALID');
});
test('same-seed policy patch reruns and exports a runnable regression',async({page})=>{
  await page.goto('/lab?scenario=response-lost');await page.getByRole('button',{name:'Fix & Re-run',exact:true}).click();await expect(page.locator('.notice.cyan')).toContainText('Seed 42220 preserved');await expect(page.locator('.run-comparison').locator('div').nth(1)).toContainText('0');
  await page.getByLabel('Replay scrubber').fill('0');await expect(page.locator('.replay-event')).toContainText('Discovered exact quote');
  const [file]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download regression test'}).click()]);expect(await readFile((await file.path())!,'utf8')).toContain("from '@echoframe/core'");
  await page.getByLabel('Severity filter').selectOption('critical');await expect(page.locator('.scenario-list>button')).toHaveCount(8);
});
test('no-code policy compilation and independent verification work',async({page})=>{
  await page.goto('/studio');await page.getByRole('button',{name:'Compile outcome proof',exact:true}).click();await expect(page.locator('.proof-output')).toContainText('TESTED PASS');
  await page.getByRole('button',{name:'Independently verify',exact:true}).click();await expect(page.locator('.proof-output .json-view').first()).toContainText('"valid": true');
  await page.getByRole('button',{name:'Weather data',exact:true}).click();await page.getByRole('button',{name:'Compile outcome proof',exact:true}).click();await expect(page.locator('.proof-output')).toContainText('NOT MACHINE VERIFIABLE');
});
test('import rejects tampering, safely renders hostile names and matches CLI-compatible verifier',async({page})=>{
  const bundle=await scenarioBundle();await page.goto('/explorer');await page.locator('.dropzone input').setInputFiles({name:'receipt.echoframe.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});await expect(page.getByRole('status')).toContainText('Bundle integrity verified');
  await expect(page.locator('.trace-workspace')).toContainText('INTEGRITY VALID');
  bundle.title='<img src=x onerror="window.injected=1">';await page.locator('.dropzone input').setInputFiles({name:'<script>.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bundle))});await expect(page.getByRole('alert')).toContainText('Bundle root commitment mismatch');expect(await page.evaluate(()=>Object.hasOwn(window,'injected'))).toBe(false);
});
test('public vault and unknown journal survive reload and work offline',async({page,context})=>{
  await page.goto('/journal');await page.getByRole('button',{name:'Create simulated pending attempt'}).click();await expect(page.locator('.recovery-recommendation')).toContainText('RECONCILE FIRST');await page.reload();await expect(page.locator('.recovery-recommendation')).toContainText('RECONCILE FIRST');
  await page.goto('/vault');await page.getByRole('button',{name:'Save active trace locally'}).click();await expect(page.locator('.vault-list article')).toHaveCount(1);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await context.setOffline(true);await page.reload();await expect(page.locator('.vault-list article')).toHaveCount(1);await page.locator('.vault-list').getByRole('button',{name:'Open',exact:true}).click();await expect(page.getByRole('status')).toContainText('reopened and verified');
  await page.locator('.vault-list').getByRole('button',{name:'Delete',exact:true}).click();await expect(page.getByText('The vault is empty')).toBeVisible();await context.setOffline(false);
});
test('real transaction input handles RPC failure without fabricated delivery',async({page})=>{
  await page.goto('/explorer');await page.getByLabel('Transaction hash',{exact:true}).fill('0x'+'12'.repeat(32));await page.getByRole('button',{name:'Inspect on Celo',exact:true}).click();await expect(page.locator('.rpc-result')).toContainText('UNKNOWN');await expect(page.locator('.rpc-result')).toContainText('Delivery unverified');await expect(page.locator('.rpc-result .transfer')).toHaveCount(0);
});
test('keyboard access, mobile drawer and reduced motion',async({page},info)=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('#main')).toBeFocused();
  if(['phone','narrow'].includes(info.project.name)){await page.getByRole('button',{name:'Open navigation',exact:true}).click();await expect(page.locator('.sidebar')).toHaveClass(/is-open/);await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Open navigation',exact:true})).toBeFocused();}
  const durations=await page.locator('.signal-path').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).animationName));expect(durations.every(v=>v==='none')).toBe(true);
});
test('WCAG automated checks pass in both themes',async({page},info)=>{
  test.skip(info.project.name!=='desktop','Full automated audits run at desktop; all viewports receive interaction tests.');
  for(const theme of ['dark','light']){
    for(const route of ['/','/explorer','/lab','/studio','/journal','/vault','/developers','/grant','/about/methodology','/story']){
      await page.goto(route);await page.evaluate(t=>{document.documentElement.dataset.theme=t;localStorage.setItem('echoframe-theme',t);},theme);
      const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();expect(result.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
    }
  }
});
test('encrypted private export reopens only with the correct passphrase',async({page})=>{
  await page.goto('/vault');await page.getByText('Encrypt a complete private export',{exact:true}).click();await page.getByLabel('Export passphrase',{exact:true}).fill('correct horse battery');
  const [file]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Encrypt and download'}).click()]);const bytes=await readFile((await file.path())!);expect(bytes.toString()).not.toContain('Paid but not delivered');
  await page.getByLabel('Choose a complete, public or encrypted file').setInputFiles({name:'private.encrypted.json',mimeType:'application/json',buffer:bytes});await page.getByLabel('Decryption passphrase (encrypted files only)').fill('wrong passphrase');await page.getByRole('button',{name:'Verify and open import'}).click();await expect(page.getByRole('alert')).toContainText('Wrong passphrase');
  await page.getByLabel('Decryption passphrase (encrypted files only)').fill('correct horse battery');await page.getByRole('button',{name:'Verify and open import'}).click();await expect(page.getByRole('status')).toContainText('Imported integrity verified');
});
test('protocol challenge parser, public story and offline report download work',async({page})=>{
  const headers=JSON.parse(await readFile('fixtures/protocol-headers.json','utf8'));await page.goto('/developers');await page.getByLabel('Header value').fill(headers.x402.paymentRequired);await page.getByRole('button',{name:'Parse challenge',exact:true}).click();await expect(page.locator('.json-view')).toContainText('"x402Version": 2');
  await page.goto('/story?sample=paid-but-not-delivered');await expect(page.locator('.trace-title')).toContainText('Paid but not delivered');const [file]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download contained story HTML'}).click()]);expect(await readFile((await file.path())!,'utf8')).toContain('Download complete evidence manifest');
});
test('every scenario runs through the interactive fix control',async({page},info)=>{
  test.skip(info.project.name!=='desktop','Scenario data tests and all viewport representative controls cover the other viewports.');
  await page.goto('/lab');const buttons=page.locator('.scenario-list>button');for(let i=0;i<16;i++){await buttons.nth(i).click();await page.getByRole('button',{name:'Fix & Re-run',exact:true}).click();await expect(page.locator('.run-comparison>div').nth(1).locator('strong')).toHaveText('0');}
});
