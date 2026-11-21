import { createHash, randomUUID } from 'node:crypto';
import { countryOf } from '../../platform/src/country.mjs';
import { htmlEscape } from '../../platform/src/text-safe.mjs';
import { publicCatalogue, slugFromName, slugProblem, normalizeSlug, recordStoreLink, priceStoreOrder, receiveStoreOrder, orderText } from '../../platform/src/catalogue.mjs';
import { hostedCountries } from './residency.mjs';

export const MAX_STORE_ORDER_BYTES = 16 * 1024;
const MAX_DERIVED_TRIES = 50;

function httpError(statusCode, error, extra = {}) {
  const err = new Error(error);
  err.statusCode = statusCode;
  err.body = { ok: false, error, ...extra };
  return err;
}

const notFound = () => httpError(404, 'NOT_FOUND');

function storeOf(state) {
  return state?.catalogue && typeof state.catalogue === 'object' ? state.catalogue : null;
}

function statusesOf(state) {
  return new Map((storeOf(state)?.orders || []).filter((order) => order.ref).map((order) => [order.ref, order.status]));
}

export function indiaHostedHere(env = process.env) {
  return hostedCountries(env).includes('IN');
}

export function storeWatch(state) {
  if (countryOf(state) !== 'IN' || !storeOf(state)) return null;
  return { snapshot: JSON.stringify(publicCatalogue(state)), chosen: normalizeSlug(storeOf(state).settings?.slug || ''), statuses: statusesOf(state) };
}

async function freeSlug(q, businessId, base) {
  for (let n = 1; n <= MAX_DERIVED_TRIES; n += 1) {
    const suffix = n === 1 ? '' : `-${n}`;
    const slug = `${base.slice(0, 40 - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (slugProblem(slug)) continue;
    const taken = await q('select business_id from store_links where slug = $1', [slug]);
    if (!taken.rowCount || taken.rows[0].business_id === businessId) return slug;
  }
  throw httpError(409, 'STORE_LINK_TAKEN', { hint: 'Choose a link name for the store.' });
}

export async function settleStore(q, businessId, session, watched) {
  const state = session.state;
  if (!watched || countryOf(state) !== 'IN') return;
  const snapshot = publicCatalogue(state);
  const text = JSON.stringify(snapshot);
  const chosen = normalizeSlug(storeOf(state)?.settings?.slug || '');
  const statuses = statusesOf(state);
  const changedOrders = [...statuses].filter(([ref, status]) => watched.statuses.get(ref) !== status);
  for (const [ref, status] of changedOrders) await q('update store_orders set status = $3 where business_id = $1 and id = $2', [businessId, ref, status]);
  if (text === watched.snapshot && chosen === watched.chosen) return;
  const row = (await q('select slug from store_links where business_id = $1', [businessId])).rows[0] || null;
  if (!row && !snapshot.enabled) return;
  let slug = row?.slug || '';
  if (chosen && chosen !== slug) {
    if (slugProblem(chosen)) throw httpError(400, slugProblem(chosen));
    const taken = await q('select business_id from store_links where slug = $1', [chosen]);
    if (taken.rowCount && taken.rows[0].business_id !== businessId) throw httpError(409, 'STORE_LINK_TAKEN', { hint: 'Another shop has this link name. Choose another.' });
    slug = chosen;
  }
  if (!slug) slug = await freeSlug(q, businessId, slugFromName(storeOf(state)?.settings?.storeName || state.company?.name || ''));
  try {
    await q(
      `insert into store_links (business_id, slug, snapshot, enabled, updated_at) values ($1, $2, $3::jsonb, $4, now())
       on conflict (business_id) do update set slug = excluded.slug, snapshot = excluded.snapshot, enabled = excluded.enabled, updated_at = now()`,
      [businessId, slug, text, snapshot.enabled === true],
    );
  } catch (err) {
    if (err?.code === '23505') throw httpError(409, 'STORE_LINK_TAKEN', { hint: 'Another shop has this link name. Choose another.' });
    throw err;
  }
  if (recordStoreLink(state, slug).changed) session.persist();
}

const PAGE_STYLE = `*{box-sizing:border-box}body{margin:0;font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f6f7f9;color:#17202e}header{background:#0f5132;color:#fff;padding:20px 16px}header h1{margin:0 0 4px;font-size:1.4rem}header p{margin:2px 0;opacity:.9}main{max-width:720px;margin:0 auto;padding:12px 16px 120px}h2{font-size:1.05rem;margin:20px 0 8px;color:#33415c}.item{background:#fff;border:1px solid #dde2ea;border-radius:12px;padding:12px;margin:8px 0;display:flex;gap:12px;align-items:center;justify-content:space-between}.item p{margin:2px 0}.muted{color:#5b6678;font-size:.9rem}.price{font-weight:600}.out{color:#a61b1b;font-size:.9rem}button,.wa{font:inherit;border:0;border-radius:10px;padding:10px 14px;cursor:pointer;background:#0f5132;color:#fff;text-decoration:none;display:inline-block;text-align:center}button[disabled]{background:#aab3c0;cursor:not-allowed}.qty{display:flex;align-items:center;gap:8px}.qty button{padding:6px 12px}#cart{background:#fff;border:1px solid #dde2ea;border-radius:12px;padding:12px;margin-top:16px}#cart[hidden]{display:none}label{display:block;margin:10px 0 4px;font-size:.9rem}input,textarea{width:100%;font:inherit;padding:10px;border:1px solid #c4ccd8;border-radius:8px;background:#fff;color:#17202e}.actions{display:flex;flex-direction:column;gap:8px;margin-top:12px}.wa{background:#1f8f4e}#status{margin-top:10px;font-weight:600}footer{text-align:center;color:#5b6678;font-size:.8rem;padding:24px 16px}@media (prefers-color-scheme:dark){body{background:#0c1220;color:#e8edf6}.item,#cart{background:#141c2e;border-color:#26324a}.muted{color:#9aa6bb}h2{color:#b8c3d6}input,textarea{background:#0c1220;color:#e8edf6;border-color:#33415c}}`;

const PAGE_SCRIPT = `(function(){var d=JSON.parse(document.getElementById('store-data').textContent);var items={};d.items.forEach(function(i){items[i.id]=i});var cart={};var cartEl=document.getElementById('cart');var linesEl=document.getElementById('cart-lines');var totalEl=document.getElementById('cart-total');var status=document.getElementById('status');var wa=document.getElementById('send-wa');function rupees(n){return '\\u20b9'+n.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}function ids(){return Object.keys(cart).filter(function(k){return cart[k]>0})}function text(){var name=document.getElementById('buyer-name').value.trim();var phone=document.getElementById('buyer-phone').value.trim();var note=document.getElementById('buyer-note').value.trim();var out=['Order for '+d.store.name];var total=0;var priced=true;ids().forEach(function(k){var i=items[k];var q=cart[k];if(typeof i.price==='number'){var a=Math.round(i.price*q*100)/100;total+=a;out.push(q+' x '+i.name+' = '+rupees(a))}else{priced=false;out.push(q+' x '+i.name)}});out.push((priced?'Total ':'Total so far ')+rupees(Math.round(total*100)/100)+(d.showPrices?' incl. GST':''));if(name)out.push('From '+name+(phone?', '+phone:''));if(note)out.push('Note: '+note);return out.join('\\n')}function render(){var list=ids();cartEl.hidden=list.length===0;while(linesEl.firstChild)linesEl.removeChild(linesEl.firstChild);var total=0;list.forEach(function(k){var i=items[k];var row=document.createElement('div');row.className='item';var left=document.createElement('p');left.textContent=i.name;var qty=document.createElement('div');qty.className='qty';var less=document.createElement('button');less.type='button';less.textContent='\\u2212';less.setAttribute('aria-label','One less '+i.name);less.addEventListener('click',function(){cart[k]=Math.max(0,cart[k]-1);render()});var n=document.createElement('span');n.textContent=String(cart[k]);var more=document.createElement('button');more.type='button';more.textContent='+';more.setAttribute('aria-label','One more '+i.name);more.addEventListener('click',function(){cart[k]=Math.min(999,cart[k]+1);render()});qty.appendChild(less);qty.appendChild(n);qty.appendChild(more);row.appendChild(left);row.appendChild(qty);linesEl.appendChild(row);if(typeof i.price==='number')total+=i.price*cart[k]});totalEl.textContent=d.showPrices?'Total '+rupees(Math.round(total*100)/100)+' incl. GST':'';if(d.store.whatsapp){wa.href='https://wa.me/'+d.store.whatsapp+'?text='+encodeURIComponent(text())}}document.querySelectorAll('[data-add]').forEach(function(b){b.addEventListener('click',function(){var k=b.getAttribute('data-add');if(!items[k])return;if(ids().length>=50&&!cart[k]){status.textContent='An order can have at most 50 items.';return}cart[k]=Math.min(999,(cart[k]||0)+1);status.textContent='';render()})});['buyer-name','buyer-phone','buyer-note'].forEach(function(id){document.getElementById(id).addEventListener('input',render)});document.getElementById('place').addEventListener('click',function(){var name=document.getElementById('buyer-name').value.trim();var phone=document.getElementById('buyer-phone').value.trim();if(!name||!/^(\\+?91|0)?[6-9][0-9]{9}$/.test(phone.replace(/[\\s-]/g,''))){status.textContent='Give your name and a 10-digit mobile number.';return}var body={buyerName:name,buyerPhone:phone,lines:ids().map(function(k){return{id:k,qty:cart[k]}})};var note=document.getElementById('buyer-note').value.trim();if(note)body.note=note;var btn=this;btn.disabled=true;status.textContent='Sending\\u2026';fetch(d.ordersUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(r){btn.disabled=false;if(r.ok&&r.j.ok){status.textContent='Order '+r.j.order.number+' sent. The shop will contact you.';cart={};render()}else{status.textContent=r.j&&r.j.hint?r.j.hint:'The order could not be sent. Try WhatsApp instead.'}}).catch(function(){btn.disabled=false;status.textContent='The order could not be sent. Try WhatsApp instead.'})});render()})();`;

const hashOf = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
export const STORE_PAGE_CSP = `default-src 'none'; script-src ${hashOf(PAGE_SCRIPT)}; style-src ${hashOf(PAGE_STYLE)}; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function itemHtml(item, showStock) {
  const out = showStock && item.inStock === false;
  return `<div class="item"><div><p><strong>${htmlEscape(item.name)}</strong></p>${item.description ? `<p class="muted">${htmlEscape(item.description)}</p>` : ''}${item.priceWords ? `<p class="price">${htmlEscape(item.priceWords)}</p>` : ''}${showStock ? `<p class="${out ? 'out' : 'muted'}">${out ? 'Out of stock' : item.inStock === true ? 'In stock' : ''}</p>` : ''}</div><button type="button" data-add="${htmlEscape(item.id)}"${out ? ' disabled' : ''}>Add</button></div>`;
}

export function storePage(slug, snapshot) {
  const store = snapshot.store || {};
  const groups = new Map();
  for (const item of snapshot.items || []) {
    const key = item.category || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const sections = [...groups].map(([category, items]) => `${category ? `<h2>${htmlEscape(category)}</h2>` : groups.size > 1 ? '<h2>More</h2>' : ''}${items.map((item) => itemHtml(item, snapshot.showStock)).join('')}`).join('');
  const data = { slug, ordersUrl: `/v1/store/${slug}/orders`, store: { name: store.name || '', whatsapp: store.whatsapp || '' }, showPrices: Boolean(snapshot.showPrices), items: (snapshot.items || []).map((item) => ({ id: item.id, name: item.name, ...(typeof item.price === 'number' ? { price: item.price } : {}) })) };
  const place = [store.address, store.city].filter(Boolean).join(', ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${htmlEscape(store.name || 'Store')}</title><style>${PAGE_STYLE}</style></head><body><header><h1>${htmlEscape(store.name || '')}</h1>${store.description ? `<p>${htmlEscape(store.description)}</p>` : ''}${place ? `<p>${htmlEscape(place)}</p>` : ''}${store.gstin ? `<p>GSTIN ${htmlEscape(store.gstin)}</p>` : ''}</header><main><p class="muted">${htmlEscape(snapshot.priceNote || '')}</p>${sections || '<p>No items yet.</p>'}<section id="cart" hidden aria-live="polite"><h2>Your order</h2><div id="cart-lines"></div><p id="cart-total" class="price"></p><label for="buyer-name">Your name</label><input id="buyer-name" maxlength="80" autocomplete="name"><label for="buyer-phone">Mobile number</label><input id="buyer-phone" maxlength="14" inputmode="tel" autocomplete="tel"><label for="buyer-note">Note for the shop (optional)</label><textarea id="buyer-note" maxlength="300" rows="2"></textarea><div class="actions">${store.whatsapp ? '<a id="send-wa" class="wa" href="#" target="_blank" rel="noopener noreferrer">Send order on WhatsApp</a>' : '<a id="send-wa" hidden></a>'}<button type="button" id="place">Place order</button></div><p id="status" role="status"></p></section></main><footer>Prices and stock are set by the shop. Made with MyCA.</footer><script type="application/json" id="store-data">${jsonForScript(data)}</script><script>${PAGE_SCRIPT}</script></body></html>`;
}

export function notFoundPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found</title><style>${PAGE_STYLE}</style></head><body><main><h2>This store link does not work.</h2><p class="muted">Check the link with the shop.</p></main></body></html>`;
}

export function createStoreFront({ db, withBooks, throttle, alertGate = null, sender = null, now = () => Date.now(), log = () => {} }) {
  async function find(slugGiven, q = (text, params) => db.query(text, params)) {
    const slug = normalizeSlug(slugGiven);
    if (slug !== String(slugGiven || '') || slugProblem(slug) || !indiaHostedHere()) return null;
    const found = await q(
      `select s.business_id, s.slug, s.snapshot from store_links s join businesses b on b.id = s.business_id
        where s.slug = $1 and s.enabled and b.deletion_requested_at is null and coalesce(b.demo, false) = false`,
      [slug],
    );
    const row = found.rows[0];
    if (!row || row.snapshot?.enabled !== true) return null;
    return row;
  }

  async function view(slug, address) {
    await throttle('storeView', address);
    const row = await find(slug);
    if (!row) throw notFound();
    return { ok: true, slug: row.slug, ...row.snapshot };
  }

  async function page(slug, address) {
    await throttle('storeView', address);
    const row = await find(slug);
    return row ? { status: 200, html: storePage(row.slug, row.snapshot) } : { status: 404, html: notFoundPage() };
  }

  async function notifyOwners(businessId, text) {
    if (!sender || typeof sender.sendText !== 'function') return;
    const owners = await db.query("select u.phone from memberships m join users u on u.id = m.user_id where m.business_id = $1 and m.role = 'owner' and u.deleted_at is null", [businessId]);
    for (const owner of owners.rows) {
      try {
        await sender.sendText(owner.phone, text);
      } catch (err) {
        log({ store: 'owner-notify-failed', error: String(err?.message || err) });
      }
    }
  }

  async function order(slug, body, address, requestId) {
    await throttle('storeOrderIp', address);
    const row = await find(slug);
    if (!row) throw notFound();
    await throttle('storeOrderStore', row.business_id);
    const ref = randomUUID();
    const out = await withBooks(row.business_id, { userId: null, deviceId: null, requestId }, async (session, q) => {
      const priced = priceStoreOrder(publicCatalogue(session.state), body);
      if (!priced.ok) return priced;
      const received = receiveStoreOrder(session.state, priced.order, { ref, receivedAt: new Date(now()).toISOString() });
      if (!received.ok) return received;
      await q(
        'insert into store_orders (id, business_id, order_no, buyer_name, buyer_phone, lines, note, status) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)',
        [ref, row.business_id, received.order.id, priced.order.buyerName, priced.order.buyerPhone, JSON.stringify(priced.order.lines), priced.order.note, 'new'],
      );
      session.persist();
      const waiting = (session.state.catalogue?.orders || []).filter((one) => one.status === 'new').length;
      return { ok: true, waiting, order: { number: received.order.id, lines: priced.order.lines.map(({ name, qty, price, amount }) => ({ name, qty, price, amount })), total: priced.order.total, priced: priced.order.priced }, storeName: row.snapshot.store?.name || '', text: orderText(row.snapshot.store?.name || '', priced.order) };
    });
    if (out.ok === false) {
      if (out.error === 'STORE_CLOSED') throw notFound();
      return { ok: false, error: out.error, hint: ORDER_HINTS[out.error] || 'Check the order and try again.' };
    }
    const { waiting, ...answer } = out;
    if (!alertGate || (await alertGate(row.business_id)).ok) await notifyOwners(row.business_id, alertText(answer.order, waiting));
    return answer;
  }

  return { find, view, page, order };
}

function alertText(order, waiting) {
  const items = order.lines.reduce((sum, line) => sum + line.qty, 0);
  const newest = `${order.number}: ${items} item${items === 1 ? '' : 's'}${order.total ? `, ₹${order.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}`;
  if (waiting > 1) return `${waiting} online store orders waiting, newest ${newest}. Open MyCA, Online store, to answer them.`;
  return `New online store order ${newest}. Open MyCA, Online store, to answer it.`;
}

const ORDER_HINTS = {
  BAD_ORDER: 'Send your name, mobile number and the items.',
  NAME_REQUIRED: 'Give your name.',
  BAD_PHONE: 'Give a 10-digit Indian mobile number.',
  NOTE_TOO_LONG: 'Keep the note short.',
  NO_LINES: 'Add at least one item.',
  TOO_MANY_LINES: 'An order can have at most 50 items.',
  BAD_LINE: 'An item in the order is not one this shop lists.',
  BAD_QUANTITY: 'Each quantity is a whole number from 1 to 999.',
  DUPLICATE_LINE: 'An item is listed twice.',
  ITEM_UNAVAILABLE: 'An item is no longer sold here. Reload the page.',
  ITEM_OUT_OF_STOCK: 'An item is out of stock. Remove it and try again.',
  STORE_INBOX_FULL: 'The shop has many orders waiting. Send this one on WhatsApp instead.',
  TOO_MANY_OPEN_FROM_PHONE: 'You already have orders waiting at this shop. Wait for the shop to answer them, or send this one on WhatsApp.',
  TOO_MANY_TODAY_FROM_PHONE: 'You have sent many orders to this shop today. Try again tomorrow, or send this one on WhatsApp.',
};
