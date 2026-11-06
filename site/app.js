/* Navoo landing - forms, attribution, tracking events. No dependencies. */
(function () {
  'use strict';
  var API = '/api/subscribe';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------- Attribution: keep first-touch UTMs for the session ---------- */
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ttclid'];
  var store = (function () { try { return window.sessionStorage; } catch (e) { return null; } })();
  var params = new URLSearchParams(location.search);
  var attribution = {};
  try { attribution = JSON.parse((store && store.getItem('navoo_attr')) || '{}'); } catch (e) {}
  if (!attribution.landing_page) {
    ATTR_KEYS.forEach(function (k) { var v = params.get(k); if (v) attribution[k] = v.slice(0, 200); });
    attribution.landing_page = location.pathname + location.search;
    attribution.referrer = document.referrer || '';
    try { store && store.setItem('navoo_attr', JSON.stringify(attribution)); } catch (e) {}
  }

  function cookie(name) {
    var m = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : '';
  }
  // Build _fbc from fbclid if the Pixel hasn't set it yet (improves CAPI match quality).
  function fbc() {
    var c = cookie('_fbc');
    if (c) return c;
    return attribution.fbclid ? 'fb.1.' + Date.now() + '.' + attribution.fbclid : '';
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function push(obj) { window.dataLayer = window.dataLayer || []; window.dataLayer.push(obj); }

  /* ---------- Forms ---------- */
  var started = false;
  document.querySelectorAll('.waitlist-form').forEach(function (form) {
    var input = form.querySelector('input[type=email]');
    var btn = form.querySelector('button[type=submit]');
    var label = btn.querySelector('.btn-label');
    var msg = form.querySelector('.form-msg');
    var where = form.getAttribute('data-form');

    input.addEventListener('focus', function () {
      if (started) return; started = true;
      push({ event: 'waitlist_form_start', form_location: where });
    });
    input.addEventListener('input', function () { input.removeAttribute('aria-invalid'); msg.textContent = ''; });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = input.value.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        input.setAttribute('aria-invalid', 'true');
        msg.textContent = 'Please enter a valid email address.';
        input.focus();
        return;
      }
      var eventId = uuid();
      btn.disabled = true; label.textContent = 'Joining…';

      var payload = {
        email: email,
        company: form.querySelector('.hp').value, // honeypot
        form_location: where,
        event_id: eventId,
        page_url: location.href,
        fbp: cookie('_fbp'),
        fbc: fbc(),
        ga_client_id: cookie('_ga'),
        attribution: attribution
      };

      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.body && res.body.error || 'Something went wrong.');
          // Client-side conversion events. Same eventID as the server-side CAPI event, so Meta de-duplicates.
          if (!res.body.duplicate) {
            if (typeof window.fbq === 'function') window.fbq('track', 'Lead', { content_name: 'Navoo waitlist' }, { eventID: eventId });
            if (typeof window.gtag === 'function') {
              window.gtag('event', 'generate_lead', { form_location: where });
              if (window.NAVOO_ADS_SEND_TO) window.gtag('event', 'conversion', { send_to: window.NAVOO_ADS_SEND_TO, transaction_id: eventId });
            }
            if (typeof window.ttq === 'object' && window.ttq.track) window.ttq.track('SubmitForm', {}, { event_id: eventId });
          }
          push({ event: 'waitlist_signup', form_location: where, event_id: eventId, duplicate: !!res.body.duplicate });
          showSuccess(res.body.duplicate);
        })
        .catch(function (err) {
          msg.textContent = err && err.message && err.message !== 'Failed to fetch' ? err.message : 'We couldn’t reach the server. Please try again.';
          btn.disabled = false; label.textContent = 'Join the waitlist';
        });
    });

    function showSuccess(dup) {
      form.classList.add('success');
      var card = document.createElement('div');
      card.className = 'success-card';
      card.innerHTML = '<span class="tick"><svg><use href="#i-check"/></svg></span><div><strong>' +
        (dup ? 'You’re already on the list.' : 'You’re on the list!') +
        '</strong><span>' + (dup ? 'We’ll be in touch as soon as early access opens.' : 'We’ll email you when early access opens. One small step done.') + '</span></div>';
      form.insertBefore(card, form.firstChild);
      // Mark every form as done so we don't ask twice.
      document.querySelectorAll('.waitlist-form').forEach(function (f) {
        if (f === form || f.classList.contains('success')) return;
        f.classList.add('success');
        f.insertBefore(card.cloneNode(true), f.firstChild);
      });
    }
  });

  /* ---------- CTA buttons that jump to a form and focus it ---------- */
  document.querySelectorAll('[data-focus-form]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var f = document.querySelector('.waitlist-form[data-form="' + a.getAttribute('data-focus-form') + '"]');
      if (!f) return;
      e.preventDefault();
      push({ event: 'cta_click', cta_location: a.closest('section,header') ? (a.closest('section,header').id || a.closest('section,header').className) : '' });
      f.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      var i = f.querySelector('input[type=email]');
      if (i) setTimeout(function () { i.focus({ preventScroll: true }); }, 450);
    });
  });

  /* ---------- Header border on scroll ---------- */
  var header = document.querySelector('.site-header');
  var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---------- Carousel dots (mobile phone row) ---------- */
  var row = document.querySelector('.phone-row');
  var dots = document.querySelectorAll('.dots i');
  if (row && dots.length) {
    row.addEventListener('scroll', function () {
      var cards = row.children, mid = row.scrollLeft + row.clientWidth / 2, best = 0, bd = 1e9;
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i].offsetLeft + cards[i].offsetWidth / 2, d = Math.abs(c - mid);
        if (d < bd) { bd = d; best = i; }
      }
      dots.forEach(function (d, i) { d.classList.toggle('on', i === best); });
    }, { passive: true });
  }

  /* ---------- Gentle reveal ---------- */
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var els = document.querySelectorAll('.section-head, .steps li, .trio, .phone-row, .join-grid, .pillars li');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) {
      if (el.getBoundingClientRect().top < innerHeight) return; // already visible: don't hide it
      el.classList.add('reveal'); io.observe(el);
    });
  }


  /* ---------- Keep every phone's content inside its 9:16 frame ----------
     Phones are sized in CSS; if a font or screen size makes a chat run long,
     shrink that phone's text slightly until it fits. */
  function fitPhones() {
    document.querySelectorAll('.phone').forEach(function (ph) {
      var body = ph.querySelector('.chat, .screen');
      if (!body) return;
      var fs = 1;
      ph.style.setProperty('--fs', fs);
      while (body.scrollHeight > body.clientHeight + 1 && fs > 0.78) {
        fs = Math.round((fs - 0.03) * 100) / 100;
        ph.style.setProperty('--fs', fs);
      }
    });
  }
  fitPhones();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPhones);
  window.addEventListener('load', fitPhones);
  var fitTimer;
  window.addEventListener('resize', function () { clearTimeout(fitTimer); fitTimer = setTimeout(fitPhones, 150); });


  /* ---------- Image focus points set in /admin ---------- */
  fetch('/api/images/config').then(function (r) { return r.ok ? r.json() : {}; }).then(function (cfg) {
    Object.keys(cfg || {}).forEach(function (slot) {
      var pos = cfg[slot] && cfg[slot].pos;
      if (!pos || !/^[\d.]+% [\d.]+%$/.test(pos)) return;
      document.querySelectorAll('img[data-img="' + slot + '"]').forEach(function (img) { img.style.objectPosition = pos; });
    });
  }).catch(function () {});

  var yr = document.getElementById('yr'); if (yr) yr.textContent = new Date().getFullYear();
})();
