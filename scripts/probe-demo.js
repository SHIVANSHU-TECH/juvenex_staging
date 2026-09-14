const { chromium } = require('playwright');

async function probe(url) {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  try { await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }); }
  catch (e) { console.log('NAV_ERROR:', e.message); }
  await page.waitForTimeout(3000);
  const data = await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div')).filter(d => d.textContent && d.textContent.trim().length > 0).length;
    return {
      title: document.title,
      url: location.href,
      bodyText: document.body.innerText,
      buttons: document.querySelectorAll('button').length,
      inputs: document.querySelectorAll('input').length,
      images: document.querySelectorAll('img').length,
      divsWithText: divs,
      hasProductClass: document.querySelectorAll('[class*="product"], [class*="card"]').length,
      forms: document.querySelectorAll('form').length,
      gridChildren: document.querySelectorAll('.grid > div').length,
    };
  });
  console.log('=== ' + url + ' ===');
  console.log('TITLE:', data.title, '| FINAL URL:', data.url);
  console.log('BUTTONS:', data.buttons, 'INPUTS:', data.inputs, 'IMGS:', data.images, 'DIVS:', data.divsWithText, 'FORMS:', data.forms);
  console.log('PRODUCT/CARD CLASS:', data.hasProductClass, 'GRID CHILDREN:', data.gridChildren);
  console.log('CONSOLE ERR (' + consoleErrors.length + '):');
  consoleErrors.forEach(e => console.log('  -', e.slice(0, 250)));
  console.log('PAGE ERR (' + pageErrors.length + '):');
  pageErrors.forEach(e => console.log('  -', e.slice(0, 250)));
  console.log('--- BODY (first 1200) ---');
  console.log(data.bodyText.slice(0, 1200));
  console.log('--- END ---\n');
  await browser.close();
}
(async () => { await probe('http://localhost:3001/shop'); await probe('http://localhost:3001/register'); })();
