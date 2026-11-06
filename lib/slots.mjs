/*
 * Every replaceable image on the landing page.
 * The page loads each one from /img/<slot>. If nothing has been uploaded in /admin,
 * the default file in site/assets is served.
 *
 *  rec   recommended upload size (px). The admin resizes uploads to fit inside this.
 *  fit   'cover' = cropped to this exact shape, 'max' = keeps its own shape (only shrunk),
 *  shown where and how big it appears on the page (CSS px, for the admin to display)
 *  format output format the admin converts to
 */
export const SLOTS = {
  hero: {
    label: 'Hero photo',
    where: 'Section 1, right side (desktop) / below the form (mobile)',
    shown: 'up to 560 × 900 desktop, full width × 3:4 on mobile',
    rec: { w: 1000, h: 1700 }, fit: 'max', format: 'image/webp',
    defaultFile: '/assets/hero-woman.webp', defaultPos: '0% 0%',
    tip: 'Portrait photo. On desktop the phone mockup covers the left ~12% of the photo, so keep the person in the right 85%.',
  },
  coach: {
    label: 'Brain cheat codes photo',
    where: 'Section 3, left side (desktop) / top of section (mobile)',
    shown: 'up to 700 × 1000 desktop, full width × 3:4 on mobile',
    rec: { w: 1200, h: 2000 }, fit: 'max', format: 'image/webp',
    defaultFile: '/assets/coach-woman.webp', defaultPos: '30% 0%',
    tip: 'Portrait photo. On desktop the right side fades into the background, so keep the person on the left/centre.',
  },
  meal: {
    label: '30-day focus meal',
    where: 'Section 2, middle phone',
    shown: '≈ 250 × 85',
    rec: { w: 600, h: 200 }, fit: 'cover', format: 'image/webp',
    defaultFile: '/assets/meal.webp', defaultPos: '50% 50%',
  },
  walk: {
    label: 'Thumbnail: 10-minute walk',
    where: 'Section 3, middle phone, 1st option',
    shown: '≈ 66 × 56',
    rec: { w: 240, h: 200 }, fit: 'cover', format: 'image/webp',
    defaultFile: '/assets/walk.webp', defaultPos: '50% 50%',
  },
  bodyweight: {
    label: 'Thumbnail: bodyweight routine',
    where: 'Section 3, middle phone, 2nd option',
    shown: '≈ 66 × 56',
    rec: { w: 240, h: 200 }, fit: 'cover', format: 'image/webp',
    defaultFile: '/assets/bodyweight.webp', defaultPos: '50% 50%',
  },
  stretch: {
    label: 'Thumbnail: stretch and reset',
    where: 'Section 3, middle phone, 3rd option',
    shown: '≈ 66 × 56',
    rec: { w: 240, h: 200 }, fit: 'cover', format: 'image/webp',
    defaultFile: '/assets/stretch.webp', defaultPos: '50% 50%',
  },
  logo: {
    label: 'Logo (full)',
    where: 'Header and footer (footer shows it in white automatically)',
    shown: '≈ 150 × 38 header',
    rec: { w: 640, h: 160 }, fit: 'max', format: 'image/png',
    defaultFile: '/assets/navoo-logo.png', defaultPos: '50% 50%',
    tip: 'Transparent PNG, dark logo. Trim empty space around it.',
  },
  mark: {
    label: 'Logo icon',
    where: 'Browser tab icon, phone app headers, chat avatars (white version made automatically)',
    shown: '≈ 28 × 28',
    rec: { w: 256, h: 256 }, fit: 'max', format: 'image/png',
    defaultFile: '/assets/navoo-mark.png', defaultPos: '50% 50%',
    tip: 'Transparent PNG, dark icon, roughly square.',
  },
  'mark-white': {
    hidden: true, label: 'Logo icon (white)', rec: { w: 256, h: 256 }, fit: 'max', format: 'image/png',
    defaultFile: '/assets/navoo-mark-white.png', defaultPos: '50% 50%',
  },
  og: {
    label: 'Social share image',
    where: 'Preview when the link is shared on WhatsApp, Facebook, LinkedIn…',
    shown: '1200 × 630 (not visible on the page)',
    rec: { w: 1200, h: 630 }, fit: 'cover', format: 'image/jpeg',
    defaultFile: '/assets/coach-woman.jpg', defaultPos: '50% 20%',
  },
};

export const ALLOWED_TYPES = ['image/webp', 'image/png', 'image/jpeg'];
export const MAX_BYTES = 4 * 1024 * 1024;
