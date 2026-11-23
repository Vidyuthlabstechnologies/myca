(() => {
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const KEY = 'myca-still';
  const isStill = () => root.classList.contains('still') || reduce.matches;
  try {
    if (window.localStorage.getItem(KEY) === '1') root.classList.add('still');
  } catch {
    root.classList.remove('still');
  }

  const toggle = document.getElementById('still-toggle');
  const syncToggle = () => toggle && toggle.setAttribute('aria-pressed', String(root.classList.contains('still')));
  if (toggle) {
    syncToggle();
    toggle.addEventListener('click', () => {
      root.classList.toggle('still');
      syncToggle();
      try {
        window.localStorage.setItem(KEY, root.classList.contains('still') ? '1' : '0');
      } catch {
        syncToggle();
      }
      document.dispatchEvent(new CustomEvent('myca-still'));
    });
  }

  const timers = new WeakMap();
  const setMood = (svg, mood) => {
    if (svg && mood) svg.dataset.mood = mood;
  };
  const say = (bubble, svg, text, ms = 3200) => {
    if (!bubble || !text) return;
    bubble.textContent = text;
    bubble.classList.add('show');
    if (svg) svg.classList.add('talking');
    clearTimeout(timers.get(bubble));
    timers.set(bubble, setTimeout(() => {
      if (svg) svg.classList.remove('talking');
      if (bubble.dataset.sticky !== 'true') bubble.classList.remove('show');
    }, ms));
    if (svg) setTimeout(() => svg.classList.remove('talking'), Math.min(ms, 1400));
  };
  window.bahi = { setMood, say, isStill };

  let frame = 0;
  let px = window.innerWidth / 2;
  let py = window.innerHeight / 3;
  const look = () => {
    frame = 0;
    if (isStill()) return;
    for (const svg of document.querySelectorAll('svg.bahi')) {
      const box = svg.getBoundingClientRect();
      if (!box.width || box.bottom < 0 || box.top > window.innerHeight) continue;
      const dx = px - (box.left + box.width * 0.55);
      const dy = py - (box.top + box.height * 0.47);
      const distance = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, distance / 260);
      svg.style.setProperty('--lx', ((dx / distance) * reach).toFixed(2));
      svg.style.setProperty('--ly', ((dy / distance) * reach).toFixed(2));
    }
  };
  window.addEventListener('pointermove', (event) => {
    px = event.clientX;
    py = event.clientY;
    if (!frame) frame = window.requestAnimationFrame(look);
  }, { passive: true });

  const TIPS = [
    'Type a sale like a message. I work out the GST.',
    'GSTR-1 is due on the 11th and GSTR-3B on the 20th.',
    'Every figure links back to the invoice behind it.',
    'Your CA can work in the same books as you.',
    'Nothing is posted until you say yes.',
  ];
  const heroButton = document.getElementById('bahi-hero');
  const heroSvg = heroButton && heroButton.querySelector('svg.bahi');
  const heroSay = document.getElementById('bahi-say');
  let tip = 0;
  if (heroButton && heroSvg) {
    heroButton.addEventListener('click', () => {
      heroButton.dataset.busy = 'true';
      setMood(heroSvg, 'celebrate');
      say(heroSay, heroSvg, TIPS[tip % TIPS.length], 3600);
      tip += 1;
      setTimeout(() => {
        setMood(heroSvg, 'happy');
        heroButton.dataset.busy = 'false';
      }, 1300);
    });
  }

  const pal = document.getElementById('bahi-pal');
  const palBody = document.getElementById('pal-body');
  const palSay = document.getElementById('pal-say');
  const stage = document.querySelector('.stage');
  if (pal && palBody && heroSvg && stage && 'IntersectionObserver' in window) {
    const palSvg = heroSvg.cloneNode(true);
    for (const node of [palSvg, ...palSvg.querySelectorAll('*')]) {
      for (const attr of [...node.attributes]) {
        if (attr.value.includes('bahi-hero')) node.setAttribute(attr.name, attr.value.replaceAll('bahi-hero', 'bahi-pal'));
      }
    }
    palSvg.style.removeProperty('--lx');
    palSvg.style.removeProperty('--ly');
    palBody.append(palSvg);
    setMood(palSvg, 'happy');
    pal.hidden = false;
    let current = null;
    new IntersectionObserver(([entry]) => {
      pal.classList.toggle('show', !entry.isIntersecting && entry.boundingClientRect.top < 0);
      if (entry.isIntersecting) palSay.classList.remove('show');
    }, { threshold: 0.15 }).observe(stage);
    const sections = [...document.querySelectorAll('section[data-bahi-section]')];
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.target === current) continue;
        current = entry.target;
        setMood(palSvg, entry.target.dataset.bahiSection);
        if (pal.classList.contains('show')) say(palSay, palSvg, entry.target.dataset.say, 3400);
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    for (const section of sections) seen.observe(section);
  }
})();
