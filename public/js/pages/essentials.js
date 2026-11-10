import { get, post } from '../api.js';
import { state } from '../app.js';
import { ago, copyText, field, h, icon, modal, mount, select, showError, toast } from '../ui.js';

/**
 * Automations → Essentials: the square tile on the Automations page and the
 * panel it opens. It shows the automations every business needs, as a simple
 * offer in sections: what's on, what's next, and a link to send it as an offer.
 */

const canEdit = () => state.me.role !== 'member';

/** The square tile. onChange is called after anything is switched on or off. */
export function essentialsTile(data, onChange) {
  const pct = Math.round((data.on / data.total) * 100);
  return h('button', { class: 'ess-tile', type: 'button', 'aria-label': `Essentials offer: ${data.on} of ${data.total} automations on. Open`, onclick: () => openEssentials(onChange) },
    h('div', { class: 'ess-tile-top' }, h('span', { class: 'ess-tile-icon' }, icon('clipboard')), h('span', { class: 'eyebrow' }, 'Essentials')),
    h('div', { class: 'ess-tile-count' }, h('b', String(data.on)), h('span', ` / ${data.total}`)),
    h('div', { class: 'small' }, 'automations every business needs'),
    h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span', { style: { width: `${pct}%` } })),
    h('div', { class: 'ess-tile-open' }, data.on < data.total ? `${data.total - data.on} more to add` : 'All switched on', ' →'));
}

/** Opens the Essentials panel on the right. */
export async function openEssentials(onChange = () => {}) {
  document.querySelector('.drawer')?.remove();
  let data;
  try { data = await get('/essentials'); } catch (err) { showError(err); return; }
  const close = () => { drawer.remove(); if (location.hash.startsWith('#/automations/essentials')) history.replaceState(null, '', '#/automations'); };
  const refresh = async () => { onChange(); await openEssentials(onChange); };
  let scrollPos = 0;
  const apply = async (changes, message) => {
    scrollPos = document.querySelector('.drawer')?.scrollTop || 0;
    try { await post('/essentials/apply', { changes }); if (message) toast(message); await refresh(); document.querySelector('.drawer').scrollTop = scrollPos; } catch (err) { showError(err); }
  };
  const items = data.sections.flatMap((s) => s.items);
  const startersOff = items.filter((i) => i.stage === 'start' && !i.on);
  const pct = Math.round((data.on / data.total) * 100);

  const drawer = h('div', { class: 'drawer ess-drawer', role: 'dialog', 'aria-label': 'Essentials offer', onkeydown: (e) => { if (e.key === 'Escape') close(); } },
    h('div', { class: 'modal-head' },
      h('div', h('div', { class: 'eyebrow' }, 'Essentials offer'), h('h2', 'What keeps ', h('span', { class: 'blue' }, data.business), ' running')),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('x'))),
    h('div', { class: 'modal-body' },
      h('div', { class: 'ess-summary' },
        h('div', h('b', { class: 'blue', style: { fontSize: '22px' } }, `${data.on} of ${data.total}`), h('span', { class: 'muted' }, ' switched on'),
          h('div', { class: 'small muted' }, `${data.start.on} of ${data.start.total} starters · each one can be switched on, tuned and built on`)),
        h('div', { class: 'progress', style: { flex: 1, minWidth: '120px' } }, h('span', { style: { width: `${pct}%` } }))),
      canEdit() ? h('div', { class: 'row' },
        h('button', { class: 'btn primary sm', onclick: () => sendOfferModal(data, refresh) }, icon('send'), 'Send as an offer'),
        startersOff.length ? h('button', { class: 'btn soft sm', onclick: () => apply(startersOff.map((i) => ({ key: i.key, on: true })), `${startersOff.length} starter${startersOff.length === 1 ? '' : 's'} switched on`) }, icon('zap'), `Switch on the ${startersOff.length} starter${startersOff.length === 1 ? '' : 's'} not on yet`) : null) : null,
      h('p', { class: 'small muted' }, h('b', { class: 'blue' }, 'Start'), ' = what most businesses begin with.  ', h('b', 'Next'), ' = the layer to add as you grow.'),
      data.sections.map((sec) => h('section', { class: 'ess-section' },
        h('div', { class: 'ess-section-head' }, h('h3', sec.title), h('span', { class: 'small muted' }, `${sec.items.filter((i) => i.on).length}/${sec.items.length} on`)),
        h('p', { class: 'small muted' }, sec.blurb),
        sec.items.map((item) => itemRow(item, data, apply)))),
      data.offers.length ? h('section', { class: 'ess-section' }, h('h3', 'Offers sent'),
        data.offers.map((o) => h('div', { class: 'list-item small' },
          h('div', { class: 'grow' }, h('b', `${o.items.length} automation${o.items.length === 1 ? '' : 's'}`), h('span', { class: 'muted' }, ` · ${o.created_by_name || 'someone'} · ${ago(o.created_at)}`),
            h('div', { class: 'muted' }, o.status === 'accepted' ? `✅ Accepted by ${o.accepted_by} ${ago(o.accepted_at)}` : o.viewed_at ? `Opened ${ago(o.viewed_at)} – not answered yet` : 'Not opened yet')),
          h('button', { class: 'btn sm', onclick: () => copyText(o.link, 'Offer link copied') }, icon('copy'), 'Copy link'),
          h('a', { class: 'btn sm ghost', href: o.link.slice(o.link.indexOf('#')), target: '_blank' }, 'View')))) : null));
  document.body.append(drawer);
  drawer.querySelector('.icon-btn')?.focus();
}

function itemRow(item, data, apply) {
  const optionsBox = h('div', { class: 'ess-options', hidden: true });
  const hasMore = item.options.length || item.edit.length || item.key === 'social_replies';
  const row = h('div', { class: `ess-item ${item.on ? 'on' : ''}` },
    h('div', { class: 'ess-item-main' },
      h('button', {
        class: `switch ${item.on ? 'on' : ''}`, disabled: !canEdit(), 'aria-label': `${item.name}: ${item.on ? 'on' : 'off'}`, 'aria-pressed': String(item.on),
        onclick: () => apply([{ key: item.key, on: !item.on }], item.on ? `${item.name} switched off` : `${item.name} switched on`),
      }),
      h('div', { class: 'grow', style: { minWidth: 0 } },
        h('div', { class: 'row', style: { gap: '8px' } }, h('b', item.name), h('span', { class: `ess-stage ${item.stage}` }, item.stage === 'start' ? 'Start' : 'Next')),
        h('div', { class: 'small', style: { marginTop: '2px' } }, item.does),
        h('div', { class: 'small muted', style: { marginTop: '2px' } }, item.result),
        item.needs.length ? h('div', { class: 'ess-needs small' }, icon('alert'), h('span', 'To finish: ', item.needs.map((n, i) => [i ? '; ' : '', n.link ? h('a', { href: n.link }, n.text) : n.text]))) : null),
      hasMore ? h('button', { class: 'btn sm ghost', 'aria-expanded': 'false', onclick: (e) => { optionsBox.hidden = !optionsBox.hidden; e.currentTarget.setAttribute('aria-expanded', String(!optionsBox.hidden)); e.currentTarget.textContent = optionsBox.hidden ? 'Options' : 'Hide'; } }, 'Options') : null),
    optionsBox);
  if (hasMore) mount(optionsBox, optionsFor(item, data, apply));
  return row;
}

function optionsFor(item, data, apply) {
  const inputs = item.options.map((o) => {
    let input;
    if (o.type === 'select') input = select(o.key, o.choices, String(o.value));
    else if (o.type === 'toggle') input = h('input', { type: 'checkbox', name: o.key, checked: Boolean(o.value), style: { width: 'auto' } });
    else if (o.type === 'textarea') input = h('textarea', { name: o.key, rows: 3, placeholder: o.placeholder || '' }, o.value || '');
    else input = h('input', { name: o.key, type: o.type === 'number' ? 'number' : o.type === 'time' ? 'time' : o.type === 'url' ? 'url' : 'text', min: o.min, max: o.max, value: o.value ?? '', placeholder: o.type === 'url' ? 'https://…' : o.placeholder || '' });
    input.disabled = !canEdit();
    return o.type === 'toggle' ? h('label', { class: 'check' }, input, h('span', o.label)) : field(o.label, input, { help: o.help });
  });
  const read = () => Object.fromEntries(item.options.map((o) => {
    const el = optionsBoxInput(o.key);
    return [o.key, el.type === 'checkbox' ? el.checked : el.value];
  }));
  let box;
  const optionsBoxInput = (key) => box.querySelector(`[name="${key}"]`);
  box = h('div', { class: 'stack', style: { gap: '10px' } },
    item.key === 'social_replies' ? socialSetup(data) : null,
    inputs,
    h('div', { class: 'row' },
      item.options.length && canEdit() ? h('button', { class: 'btn sm primary', onclick: () => apply([{ key: item.key, options: read() }], 'Saved') }, 'Save') : null,
      item.edit.length ? h('a', { class: 'btn sm', href: '#/settings/wording' }, icon('edit'), 'Change the wording') : null));
  return box;
}

/** How Instagram, Facebook and TikTok messages reach the system – and a way to try it. */
function socialSetup(data) {
  const addr = data.social.address;
  return h('div', { class: 'stack', style: { gap: '8px' } },
    h('p', { class: 'small' }, 'Instagram, Facebook and TikTok only let approved apps read DMs and comments, so they come in through ', h('b', 'ManyChat, Make or Zapier'), ': add a step that sends each new DM or comment to this address. The reply comes straight back for the step to post (or add your step’s web address below and replies are sent there).'),
    addr ? h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('input', { readonly: true, value: addr, class: 'mono', 'aria-label': 'Social address', onfocus: (e) => e.target.select() }),
      h('button', { class: 'btn sm', onclick: () => copyText(addr, 'Social address copied') }, icon('copy'), 'Copy')) : h('p', { class: 'small muted' }, 'Ask an owner or admin for the social address.'),
    h('details', h('summary', { class: 'small', style: { cursor: 'pointer', fontWeight: 700 } }, 'What to send'),
      h('pre', { class: 'pre mono small' }, '{\n  "platform": "instagram",      // or facebook, tiktok\n  "type": "dm",                  // or comment\n  "from": "their_handle",\n  "name": "Their Name",\n  "text": "How much is a full set?",\n  "comment_id": "…"              // for comments\n}\n\nReply: { "reply": "…DM to send…", "comment_reply": "…public reply…" }')),
    h('div', { class: 'row' }, h('button', { class: 'btn sm soft', onclick: () => tryDm() }, icon('chat'), 'Try it: send a test DM or comment')));
}

function tryDm() {
  const body = h('div', { class: 'grid g2' },
    field('Platform', select('channel', [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']], 'instagram')),
    field('Type', select('type', [['dm', 'DM'], ['comment', 'Comment on a post']], 'dm')),
    field('From (their handle)', h('input', { name: 'from', value: 'sarah.lashes' })),
    field('Their name', h('input', { name: 'name', value: 'Sarah Jones' })),
    h('div', { style: { gridColumn: '1 / -1' } }, field('Message', h('textarea', { name: 'body', rows: 2 }, 'Hi! How much is a full set?'))));
  modal('Try a DM or comment', body, { actions: [
    { label: 'Cancel' },
    { label: 'Send it in', primary: true, onClick: async () => {
      const f = Object.fromEntries([...body.querySelectorAll('[name]')].map((el) => [el.name, el.value]));
      const out = await post('/messages/simulate/inbound', { channel: f.channel, type: f.type, from: f.from, name: f.name, body: f.body, post: f.type === 'comment' ? 'your latest post' : undefined });
      const replies = out.replies || [];
      toast(replies.length ? `Replied: “${replies[replies.length - 1].text.slice(0, 80)}…”` : 'Received – DM & comment auto replies are off, so a reply task was made');
      location.hash = `#/messages/${out.contact.id}`;
    } },
  ] });
}

function sendOfferModal(data, done) {
  const items = data.sections.flatMap((s) => s.items);
  const body = h('div', { class: 'stack' });
  const pick = (keys) => body.querySelectorAll('input[type=checkbox][data-key]').forEach((el) => { el.checked = keys.includes(el.dataset.key); });
  mount(body,
    h('p', { class: 'small' }, 'Choose what to offer. The business gets a simple page explaining each one, and saying yes switches them all on in their system.'),
    h('div', { class: 'row', style: { gap: '6px' } },
      h('button', { class: 'chip', type: 'button', onclick: () => pick(items.filter((i) => i.stage === 'start').map((i) => i.key)) }, 'The starters'),
      h('button', { class: 'chip', type: 'button', onclick: () => pick(items.filter((i) => !i.on).map((i) => i.key)) }, 'Everything not on yet'),
      h('button', { class: 'chip', type: 'button', onclick: () => pick(items.map((i) => i.key)) }, `All ${items.length}`),
      h('button', { class: 'chip', type: 'button', onclick: () => pick([]) }, 'None')),
    data.sections.map((sec) => h('div', h('div', { class: 'eyebrow', style: { margin: '6px 0 4px' } }, sec.title),
      sec.items.map((i) => h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-key': i.key, checked: !i.on }), h('span', i.name, i.on ? h('span', { class: 'muted' }, ' (already on)') : null))))),
    field('A note for them (optional)', h('textarea', { name: 'note', rows: 2, placeholder: 'e.g. These are the ones we talked about – we’ll set up the wording with you.' })));
  modal('Send as an offer', body, { wide: true, actions: [
    { label: 'Cancel' },
    { label: 'Create the offer link', primary: true, onClick: async () => {
      const keys = [...body.querySelectorAll('input[data-key]:checked')].map((el) => el.dataset.key);
      if (!keys.length) { toast('Tick at least one automation', 'error'); return false; }
      const offer = await post('/essentials/offers', { items: keys, note: body.querySelector('[name=note]').value });
      modal('Your offer is ready', h('div', { class: 'stack' },
        h('p', { class: 'small' }, `Send this link to the business. It explains the ${keys.length} automation${keys.length === 1 ? '' : 's'} in plain words, and “Yes – switch them on” turns them on in their system.`),
        h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('input', { readonly: true, value: offer.link, class: 'mono', onfocus: (e) => e.target.select() }),
          h('button', { class: 'btn sm primary', onclick: () => copyText(offer.link, 'Offer link copied') }, icon('copy'), 'Copy'))), { actions: [
        { label: 'Open it', onClick: () => { window.open(offer.link.slice(offer.link.indexOf('#')), '_blank'); } },
        { label: 'Done', primary: true },
      ] });
      await done();
      return true;
    } },
  ] });
}
