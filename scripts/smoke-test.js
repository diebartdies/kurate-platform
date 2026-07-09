/**
 * Frontend smoke test — run while server is up: node scripts/smoke-test.js
 */
const puppeteer = require('puppeteer');

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5000';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'admin@drsrv.net.ar';
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || '123456';

const results = [];

function log(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function primeSession(page) {
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('is18Plus', 'true');
    sessionStorage.setItem('valid_entry', 'true');
    sessionStorage.setItem('ancestor_code', 'index.html');
  });
}

async function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#email', email, { delay: 10 });
  await page.type('#password', password, { delay: 10 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
    page.click('button[type="submit"]')
  ]);
  await new Promise((r) => setTimeout(r, 1500));
  const token = await page.evaluate(() => localStorage.getItem('token'));
  return !!token;
}

async function main() {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await primeSession(page);
    const errors = await collectErrors(page);

    // Categories
    await page.goto(`${BASE}/categories.html`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('#treasureGrid', { timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));
    const gridHtml = await page.$eval('#treasureGrid', (el) => el.innerHTML).catch(() => '');
    const hasCards = gridHtml.includes('treasure-card') || gridHtml.includes('No Treasures Found') || gridHtml.includes('Loading');
    log('Categories page loads', !!gridHtml, hasCards ? 'grid rendered' : 'empty grid');

    // Profile — pick first alias from API
    let alias = null;
    try {
      alias = await page.evaluate(async () => {
        const res = await fetch('/api/v1/professionals?limit=1');
        const data = await res.json();
        return data?.data?.[0]?.professionalProfile?.alias || null;
      });
    } catch (e) {
      alias = null;
    }

    if (alias) {
      await page.evaluate(() => sessionStorage.setItem('ancestor_code', 'categories.html'));
      await page.goto(`${BASE}/perfil/${encodeURIComponent(alias)}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector('#treasureContent:not(.hidden), #loader', { timeout: 15000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
      const profileOk = await page.evaluate(() => {
        const content = document.getElementById('treasureContent');
        const loader = document.getElementById('loader');
        if (content && !content.classList.contains('hidden')) return content.textContent.includes('Specialties') || content.querySelector('h2');
        return loader && loader.textContent && !loader.textContent.includes('Error');
      });
      log('Profile page', !!profileOk, alias);
    } else {
      log('Profile page', false, 'no professional alias in API');
    }

    // Login for protected pages
    const loggedIn = await login(page, ADMIN_EMAIL, ADMIN_PASS);
    log('Admin login', loggedIn, loggedIn ? ADMIN_EMAIL : 'no token stored');

    if (loggedIn) {
      await page.evaluate(() => {
        sessionStorage.setItem('valid_entry', 'true');
        sessionStorage.setItem('ancestor_code', 'login.html');
      });

      // Dashboard
      await page.goto(`${BASE}/dashboard.html`, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector('#dashboardContent:not(.hidden), #loader', { timeout: 20000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2500));
      const dashOk = await page.evaluate(() => {
        const c = document.getElementById('dashboardContent');
        if (!c || c.classList.contains('hidden')) return false;
        return c.textContent.includes('Admin Control Panel') || c.textContent.includes('Access Denied') === false;
      });
      log('Admin dashboard', dashOk);

      // Pending verifications modal
      const pendingBtn = await page.$('#btnPendingApprovals');
      if (pendingBtn) {
        await pendingBtn.click();
        await new Promise((r) => setTimeout(r, 1500));
        const modalOk = await page.evaluate(() => {
          const modal = document.getElementById('pendingModal');
          const closeBtn = document.getElementById('pendingModalCloseBtn');
          return modal && getComputedStyle(modal).display !== 'none' && !!closeBtn;
        });
        log('Admin pending verifications modal', modalOk);
        const closeBtn = await page.$('#pendingModalCloseBtn');
        if (closeBtn) await closeBtn.click();
      } else {
        log('Admin pending verifications modal', false, 'button not found');
      }
    } else {
      log('Admin dashboard', false, 'skipped — login failed');
      log('Admin pending verifications modal', false, 'skipped — login failed');
    }

    // Professional dashboard (separate login)
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(() => {
      localStorage.setItem('is18Plus', 'true');
      sessionStorage.setItem('valid_entry', 'true');
      sessionStorage.setItem('ancestor_code', 'login.html');
    });
    const profLoggedIn = await login(page, 'pro1@example.com', 'password123');
    log('Professional login', profLoggedIn, profLoggedIn ? 'pro1@example.com' : 'no token');
    if (profLoggedIn) {
      await page.goto(`${BASE}/profDashboard.html`, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector('#profDashboardContent:not(.hidden)', { timeout: 20000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 2000));
      const profOk = await page.evaluate(() => {
        const content = document.getElementById('profDashboardContent');
        return content && !content.classList.contains('hidden') && content.textContent.includes('Professional Dashboard');
      });
      log('Prof dashboard', profOk);
    } else {
      log('Prof dashboard', false, 'skipped — pro login failed (create a pro account or restore backup)');
    }

    const moduleErrors = errors.filter((e) =>
      /Failed to fetch dynamically imported module|Unexpected token|SyntaxError|Cannot find module/i.test(e)
    );
    log('No JS module errors', moduleErrors.length === 0, moduleErrors[0] || `${errors.length} console errors total`);

    const failed = results.filter((r) => !r.ok);
    console.log(`\n--- ${results.length - failed.length}/${results.length} passed ---`);
    process.exit(failed.length ? 1 : 0);
  } catch (err) {
    console.error('Smoke test crashed:', err.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
