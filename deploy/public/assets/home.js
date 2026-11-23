(() => {
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => root.classList.contains('still') || reduce.matches;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  if ('IntersectionObserver' in window) {
    const once = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('inview');
        once.unobserve(entry.target);
      }
    }, { threshold: 0.35 });
    for (const node of document.querySelectorAll('.flow, .month')) once.observe(node);
  }

  const bahi = window.bahi || { setMood() {}, say() {} };
  const heroSvg = document.querySelector('#bahi-hero svg.bahi');
  const heroSay = document.getElementById('bahi-say');
  const heroButton = document.getElementById('bahi-hero');
  const busy = () => heroButton && heroButton.dataset.busy === 'true';
  const mood = (name) => {
    if (!busy()) bahi.setMood(heroSvg, name);
  };
  const talk = (text, ms) => {
    if (!busy()) bahi.say(heroSay, heroSvg, text, ms);
  };

  const thread = document.getElementById('demo-thread');
  const typed = document.getElementById('demo-typed');
  const go = document.getElementById('demo-go');
  const phone = document.querySelector('.phone');
  const who = document.querySelector('.bar .who');
  const avatar = document.querySelector('.bar .avatar');
  let phoneVisible = true;
  const halted = () => still() || !phoneVisible || document.hidden;
  const wait = async (ms) => {
    let spent = 0;
    while (spent < ms) {
      await sleep(80);
      if (!halted()) spent += 80;
    }
  };

  const SCENES = [
    {
      party: ['S', 'Sharma Traders', '27AAKFS4321M1Z8'],
      before: { eyebrow: '2026-10-02 · Paid', title: 'Invoice INV-0041', big: '₹8,260.00' },
      say: 'Sold to Sharma Traders ₹12,000 + 18% GST',
      think: 'Working out the GST for you.',
      card: { eyebrow: 'Not posted yet', title: 'Invoice to Sharma Traders: total ₹14,160.00.', lines: ['CGST ₹1,080.00 · SGST ₹1,080.00', 'Goes into your GSTR-1 for October 2026', 'The books change only after you confirm.'] },
      action: 'Post it',
      done: { eyebrow: 'Posted · INV-0042', line: 'In your books and in your October GSTR-1.' },
      cheer: 'Posted! It is in your October GSTR-1.',
    },
    {
      party: ['M', 'Ask MyCA', 'Your books, October 2026'],
      before: { eyebrow: 'Today', title: 'Sales this month', big: '₹3,48,900.00' },
      say: 'Who owes me?',
      think: 'Checking who owes you.',
      card: { eyebrow: 'Answer', title: '3 customers owe you ₹46,300.00.', lines: ['Kiran Stores ₹22,500.00 · 41 days', 'Sharma Traders ₹14,160.00 · 3 days', 'Mehta & Sons ₹9,640.00 · 12 days'] },
      action: 'Remind them',
      done: { eyebrow: 'Reminders ready', line: 'Each one opens WhatsApp on your phone to send.' },
      cheer: 'Three reminders, each in a tone that fits.',
      calm: true,
    },
    {
      party: ['K', 'Kiran Stores', 'Customer since 2024'],
      before: { eyebrow: '2026-09-21 · Due', title: 'Invoice INV-0038', big: '₹22,500.00' },
      say: 'Received 5,000 from Kiran Stores',
      think: 'Matching it to their invoice.',
      card: { eyebrow: 'Not posted yet', title: 'Payment from Kiran Stores: ₹5,000.00.', lines: ['Against INV-0038 (₹22,500.00)', 'Kiran Stores will still owe ₹17,500.00', 'Into your bank account'] },
      action: 'Record it',
      done: { eyebrow: 'Recorded', line: 'Kiran Stores now owes ₹17,500.00.' },
      cheer: 'Recorded. The balance is up to date.',
    },
  ];

  const entry = (data) => {
    const card = el('div', 'entry posted');
    card.append(el('div', 'eyebrow', data.eyebrow), el('p', '', data.title), el('p', 'money big', data.big));
    return card;
  };

  const play = async (scene) => {
    avatar.textContent = scene.party[0];
    who.replaceChildren(el('b', '', scene.party[1]), el('span', '', scene.party[2]));
    thread.replaceChildren(entry(scene.before));
    go.textContent = scene.action;
    go.classList.remove('press');
    mood('wave');
    await wait(900);
    typed.classList.add('typing');
    typed.textContent = '';
    for (const char of scene.say) {
      typed.textContent += char;
      await wait(char === ' ' ? 30 : 46);
    }
    await wait(450);
    typed.classList.remove('typing');
    typed.textContent = 'Ask or tell MyCA anything';
    thread.append(el('div', 'msg-me money pop', scene.say));
    await wait(350);
    const dots = el('div', 'entry dots pop');
    dots.append(el('span'), el('span'), el('span'));
    thread.append(dots);
    mood('thinking');
    talk(scene.think, 1800);
    await wait(1300);
    const card = el('div', `entry ${scene.calm ? 'answer' : 'pending'} pop`);
    const eyebrow = el('div', 'eyebrow', scene.card.eyebrow);
    const meta = el('div', 'meta money');
    card.append(eyebrow, el('p', 'money', scene.card.title), meta);
    dots.replaceWith(card);
    for (const line of scene.card.lines) {
      await wait(380);
      meta.append(el('div', 'pop', line));
    }
    mood('happy');
    await wait(1100);
    go.classList.add('press');
    await wait(650);
    go.classList.remove('press');
    card.className = 'entry posted pop';
    eyebrow.textContent = scene.done.eyebrow;
    const tick = el('div', 'done-line pop', scene.done.line);
    card.append(tick);
    mood('celebrate');
    talk(scene.cheer, 2600);
    await wait(2600);
    mood('happy');
    await wait(1400);
  };

  if (thread && typed && go && phone && who && avatar) {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([seen]) => {
        phoneVisible = seen.isIntersecting;
      }, { threshold: 0.2 }).observe(phone);
    }
    const run = async () => {
      if (still()) return;
      talk('Namaste! I am Bahi. Watch me keep the books.', 3000);
      await wait(2400);
      for (let n = 0; ; n += 1) await play(SCENES[n % SCENES.length]);
    };
    if (still()) {
      const start = () => {
        if (still()) return;
        document.removeEventListener('myca-still', start);
        run();
      };
      document.addEventListener('myca-still', start);
    } else {
      run();
    }
  }

  const steps = [...document.querySelectorAll('#steps .step')];
  const viz = document.getElementById('viz');
  const sayText = document.getElementById('say-text');
  const PHRASES = ['received 5,000 from Kiran Stores', 'paid 8,000 rent', 'who owes me?', 'bill from Gupta Steel, 23,600 with GST'];
  if (steps.length && viz) {
    let active = 0;
    let manual = false;
    let visible = false;
    const show = (index) => {
      active = index;
      viz.dataset.step = String(index);
      steps.forEach((button, n) => button.setAttribute('aria-pressed', String(n === index)));
    };
    for (const button of steps) {
      button.addEventListener('click', () => {
        manual = true;
        viz.classList.remove('auto');
        show(Number(button.dataset.step));
      });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([seen]) => {
        visible = seen.isIntersecting;
      }, { threshold: 0.3 }).observe(viz);
    }
    const stepWait = async (ms) => {
      let spent = 0;
      while (spent < ms) {
        await sleep(100);
        if (visible && !still() && !document.hidden) spent += 100;
      }
    };
    (async () => {
      let phrase = 0;
      for (;;) {
        await stepWait(200);
        if (manual || still()) continue;
        viz.classList.add('auto');
        if (active === 0 && sayText) {
          const text = PHRASES[phrase % PHRASES.length];
          phrase += 1;
          sayText.textContent = '';
          for (const char of text) {
            if (manual) break;
            sayText.textContent += char;
            await stepWait(55);
          }
          if (manual) continue;
          await stepWait(2200);
        } else {
          await stepWait(4600);
        }
        if (!manual) show((active + 1) % steps.length);
      }
    })();
  }
})();
