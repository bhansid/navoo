#!/usr/bin/env node
/*
 * Build step (runs on Netlify on every deploy, no dependencies):
 * copies /site to /dist and injects tracking tags from environment variables
 * into index.html at <!--NAVOO_HEAD--> and <!--NAVOO_BODY-->.
 *
 * Env vars (Netlify → Site configuration → Environment variables):
 *   META_PIXEL_ID, GTM_ID, GA4_ID, GOOGLE_ADS_ID, GOOGLE_ADS_LEAD_LABEL
 * Extra scripts: edit tracking/custom-head.html and tracking/custom-body.html
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'site');
const OUT = path.join(__dirname, 'dist');
const env = k => (process.env[k] || '').trim();

const RULES = {
  META_PIXEL_ID: /^\d{8,20}$/,
  GTM_ID: /^GTM-[A-Z0-9]{4,12}$/,
  GA4_ID: /^G-[A-Z0-9]{4,16}$/,
  GOOGLE_ADS_ID: /^AW-\d{6,14}$/,
  GOOGLE_ADS_LEAD_LABEL: /^[A-Za-z0-9_\-]{4,40}$/,
};
const s = {};
for (const [k, re] of Object.entries(RULES)) {
  const v = env(k);
  if (!v) continue;
  if (!re.test(v)) { console.warn(`⚠ ${k}="${v}" doesn't look valid — skipped. Check the value in Netlify env vars.`); continue; }
  s[k] = v;
}

const head = [], body = [];
if (s.GTM_ID) {
  head.push(`<!-- Google Tag Manager --><script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${s.GTM_ID}');</script>`);
  body.push(`<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${s.GTM_ID}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`);
}
const gIds = [s.GA4_ID, s.GOOGLE_ADS_ID].filter(Boolean);
if (gIds.length) {
  head.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${gIds[0]}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${gIds.map(id => `gtag('config','${id}');`).join('')}${
    s.GOOGLE_ADS_ID && s.GOOGLE_ADS_LEAD_LABEL ? `window.NAVOO_ADS_SEND_TO='${s.GOOGLE_ADS_ID}/${s.GOOGLE_ADS_LEAD_LABEL}';` : ''}</script>`);
}
if (s.META_PIXEL_ID) {
  head.push(`<!-- Meta Pixel --><script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${s.META_PIXEL_ID}');fbq('track','PageView');</script>`);
  body.push(`<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${s.META_PIXEL_ID}&ev=PageView&noscript=1"></noscript>`);
}
const custom = f => { try { return fs.readFileSync(path.join(__dirname, 'tracking', f), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim(); } catch { return ''; } };
if (custom('custom-head.html')) head.push(custom('custom-head.html'));
if (custom('custom-body.html')) body.push(custom('custom-body.html'));

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });
const idx = path.join(OUT, 'index.html');
fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace('<!--NAVOO_HEAD-->', head.join('\n')).replace('<!--NAVOO_BODY-->', body.join('\n')));

console.log('✓ Built dist/ with:', Object.keys(s).length ? Object.keys(s).join(', ') : 'no tracking IDs set');
if (!env('SHEETS_WEBHOOK_URL')) console.warn('⚠ SHEETS_WEBHOOK_URL is not set — sign-ups will fail until you add it.');
