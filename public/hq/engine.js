// ─────────────────────────────────────────────────────────────────────────────
//  The AI team. Each built-in agent has a `run` that checks its area of the
//  business, fixes what it can on its own, passes work to teammates, and
//  brings anything that needs a decision to "Your desk" for sign-off.
//  Agents set to "Act on their own" (autonomy: 'auto') send things without
//  asking; agents set to "Ask me first" (autonomy: 'ask') queue them for you.
// ─────────────────────────────────────────────────────────────────────────────
import { addDaysIso, daysSince, daysUntil, fill, firstName, money, nowIso, ordinal, shortDate, sum, today, uid } from './util.js';
import { checkinDue, monthOf, progress, quietDays } from './results.js';

export const DEAL_OPEN = ['new', 'drafted', 'sent', 'negotiating'];
export const PROJECT_STAGES = ['Signed', 'Kickoff', 'Building', 'Review', 'Live'];

export const agentById = (s, id) => s.agents.find((a) => a.id === id);
export const agentFor = (s, builtIn) => s.agents.find((a) => a.builtIn === builtIn && a.enabled !== false);
const nameOf = (s, id) => (id === 'you' ? 'You' : agentById(s, id)?.name || id);

export function log(s, from, to, text) {
  s.activity.unshift({ id: uid('a'), from, to, text, at: nowIso() });
  s.activity = s.activity.slice(0, 200);
}

export function addApproval(s, a) {
  if (s.approvals.some((x) => x.kind === a.kind && x.refId === a.refId)) return null;
  const item = { id: uid('ap'), createdAt: nowIso(), ...a };
  s.approvals.push(item);
  return item;
}

export const quoteTotal = (deal) => sum(deal.quote || [], (l) => l.price);
export const dealValue = (deal) => quoteTotal(deal) || Number(deal.budget) || 0;

// ── Leads ────────────────────────────────────────────────────────────────────
export function scoreLead(s, lead) {
  let score = 30;
  const b = Number(lead.budget) || 0;
  if (b >= 1500) score += 30; else if (b >= 500) score += 20; else if (b > 0) score += 10;
  if (/asap|urgent|this week|this month|now|straight away/i.test(lead.timeline || '')) score += 20;
  else if (/next month|soon|weeks/i.test(lead.timeline || '')) score += 10;
  const text = `${lead.need} ${lead.message}`.toLowerCase();
  if (s.rateCard.some((r) => keywordsOf(r).some((k) => text.includes(k)))) score += 15;
  if ((lead.message || '').length > 60) score += 5;
  return Math.min(100, score);
}
export const heat = (s, score) => (score >= (s.settings.autoReply.hotScore || 70) ? 'hot' : score >= 45 ? 'warm' : 'cold');

const keywordsOf = (r) => String(r.keywords || '').split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
export function isScam(s, lead) {
  const words = String(s.settings.autoReply.scamWords || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  const text = `${lead.need} ${lead.message} ${lead.contact}`.toLowerCase();
  return words.some((w) => text.includes(w));
}

export function autoReplyText(s, lead) {
  return fill(s.settings.autoReply.template, {
    first: firstName(lead.name), name: lead.name, business: s.profile.business, owner: s.profile.owner,
    need: lead.need || 'your enquiry', booking_link: s.profile.bookingLink, their_business: lead.business || '',
  });
}

/** Turns a qualified lead into a deal for the Deal Manager. */
export function handOver(s, lead, reason = 'hot lead') {
  const deal = {
    id: uid('dl'), client: lead.business || lead.name, contact: lead.name, email: lead.contact, want: lead.need || lead.message,
    budget: lead.budget || 0, deadline: '', stage: 'new', quote: [], draft: '', lastContactAt: nowIso(), followUps: 0,
    contract: { status: 'none', value: 0 }, leadId: lead.id, createdAt: nowIso(),
  };
  s.deals.unshift(deal);
  lead.status = 'handed';
  lead.dealId = deal.id;
  const rec = agentFor(s, 'receptionist')?.id || 'you';
  const dm = agentFor(s, 'deals')?.id || 'you';
  log(s, rec, dm, `${reason[0].toUpperCase()}${reason.slice(1)}: ${deal.client} wants ${lead.need || 'help'}${lead.budget ? ` (budget ${money(lead.budget, s.profile.currency)})` : ''}`);
  return deal;
}

// ── Deals ────────────────────────────────────────────────────────────────────
export function buildQuote(s, deal) {
  const text = `${deal.want}`.toLowerCase();
  const lines = s.rateCard.filter((r) => keywordsOf(r).some((k) => text.includes(k))).map((r) => ({ item: r.item, price: Number(r.price) }));
  return lines.length ? lines : (deal.budget ? [{ item: deal.want || 'Custom automation', price: Number(deal.budget) }] : []);
}

export function replyDraft(s, deal) {
  const cur = s.profile.currency;
  const lines = (deal.quote || []).map((l) => `• ${l.item} – ${money(l.price, cur)}`).join('\n');
  return `Hi ${firstName(deal.contact)},\n\nThanks for reaching out about ${deal.want ? deal.want.charAt(0).toLowerCase() + deal.want.slice(1) : 'your project'} – it’s exactly the kind of thing we build every week, so this is a great fit.\n\n${lines ? `Here’s what I’d recommend:\n${lines}\n\nThat comes to ${money(quoteTotal(deal), cur)} all in${deal.deadline ? `, and we can have it live before ${shortDate(deal.deadline)}` : ''}.` : 'I’d love to understand a bit more before quoting – what’s the main thing you want sorted first?'}\n\nIf you’re happy, I’ll send the agreement over and we can get started this week. Or grab a quick call here: ${s.profile.bookingLink}\n\nBest,\n${s.profile.owner}`;
}

export function followUpDraft(s, deal) {
  const n = (deal.followUps || 0) + 1;
  const lines = [
    `Hi ${firstName(deal.contact)},\n\nJust floating this back to the top of your inbox – are you still keen to go ahead with ${deal.want ? deal.want.charAt(0).toLowerCase() + deal.want.slice(1) : 'the project'}? I’m planning next month’s builds now, so if you can confirm this week I’ll hold a slot for you.\n\nBest,\n${s.profile.owner}`,
    `Hi ${firstName(deal.contact)},\n\nQuick nudge on the quote (${money(dealValue(deal), s.profile.currency)}). Happy to jump on a 10-minute call if anything needs tweaking: ${s.profile.bookingLink}\n\nBest,\n${s.profile.owner}`,
    `Hi ${firstName(deal.contact)},\n\nI haven’t heard back so I’ll assume the timing isn’t right – no problem at all. I’ll close this off for now, but just reply here whenever you’re ready and we’ll pick it straight back up.\n\nBest,\n${s.profile.owner}`,
  ];
  return lines[Math.min(n, lines.length) - 1];
}

// ── Built-in agents ──────────────────────────────────────────────────────────
const RUNS = {
  receptionist(s, me, out) {
    const ar = s.settings.autoReply;
    const dm = agentFor(s, 'deals');
    let answered = 0; let handed = 0;
    for (const lead of s.leads) {
      if (lead.status !== 'new') continue;
      if (isScam(s, lead)) {
        lead.status = 'scam';
        out.fixed.push(`${lead.name} asked for card details – flagged as a scam, not replied`);
        continue;
      }
      lead.score = scoreLead(s, lead);
      const text = autoReplyText(s, lead);
      if (ar.enabled) {
        lead.thread = [...(lead.thread || []), ...(lead.thread?.length ? [] : [{ from: 'them', text: lead.message, at: lead.receivedAt }]), { from: 'auto', text, at: nowIso() }];
        lead.status = 'replied';
        lead.lastReplyAt = nowIso();
        answered++;
      } else {
        addApproval(s, { agentId: me.id, kind: 'lead-reply', refId: lead.id, title: `Reply to ${lead.name} is ready`, sub: `${lead.channel} · ${lead.need || 'new enquiry'}`, body: text });
        out.needs.push(`Reply to ${lead.name} (${lead.channel}) – auto-replies are off`);
      }
      if (dm && heat(s, lead.score) === 'hot') { handOver(s, lead, 'hot lead'); handed++; }
    }
    for (const lead of s.leads) {
      if (lead.status === 'replied' && dm && heat(s, lead.score || scoreLead(s, lead)) === 'warm' && daysSince(lead.lastReplyAt) >= 1) {
        handOver(s, lead, 'warm lead'); handed++;
      } else if (lead.status === 'replied' && daysSince(lead.lastReplyAt) >= s.settings.deals.coldDays) {
        lead.status = 'cold';
        out.fixed.push(`${lead.name} went quiet for ${s.settings.deals.coldDays}+ days – moved to cold`);
      }
    }
    if (answered) out.fixed.unshift(`Answered ${answered} new enquir${answered === 1 ? 'y' : 'ies'} automatically`);
    if (handed) out.fixed.push(`Handed ${handed} qualified lead${handed === 1 ? '' : 's'} to the ${dm?.name || 'Deal Manager'}`);
    const fresh = s.leads.filter((l) => daysSince(l.receivedAt) <= 1).length;
    out.summary = `Checked ${s.leads.length} leads, ${fresh} new in the last day${answered ? `, ${answered} answered in under a minute` : ''}.`;
  },

  deals(s, me, out) {
    const cur = s.profile.currency;
    const cfg = s.settings.deals;
    let drafted = 0; let nudges = 0;
    for (const deal of s.deals) {
      if (deal.stage === 'new') {
        if (!deal.quote?.length) deal.quote = buildQuote(s, deal);
        deal.draft = replyDraft(s, deal);
        deal.stage = 'drafted';
        drafted++;
      }
      if (deal.stage === 'drafted') {
        if (me.autonomy === 'auto') { sendDeal(s, deal, me); out.fixed.push(`Sent the quote to ${deal.client} (${money(dealValue(deal), cur)})`); }
        else if (addApproval(s, { agentId: me.id, kind: 'reply', refId: deal.id, title: `Reply to ${deal.client} is ready`, sub: `${deal.want} · quote ${money(dealValue(deal), cur)}`, body: deal.draft })) {
          out.needs.push(`Reply to ${deal.client} – worth ${money(dealValue(deal), cur)}`);
        }
      }
      if (deal.stage === 'sent' && daysSince(deal.lastContactAt) >= cfg.followUpDays) {
        if ((deal.followUps || 0) >= cfg.maxFollowUps) {
          deal.stage = 'lost';
          out.fixed.push(`${deal.client} never replied after ${cfg.maxFollowUps} nudges – closed as lost`);
          continue;
        }
        const body = followUpDraft(s, deal);
        const days = daysSince(deal.lastContactAt);
        if (me.autonomy === 'auto') { applyFollowUp(s, deal, body); out.fixed.push(`Followed up ${deal.client} (${days} days quiet)`); }
        else if (addApproval(s, { agentId: me.id, kind: 'followup', refId: deal.id, title: `Follow up to ${deal.client} is ready`, sub: `No reply for ${days} days, ${ordinal((deal.followUps || 0) + 1)} nudge`, body })) nudges++;
      }
      if (deal.stage === 'won' && deal.contract?.status === 'received') {
        const quoted = quoteTotal(deal);
        const value = Number(deal.contract.value) || 0;
        if (quoted && value && Math.abs(quoted - value) > 0.5) {
          out.needs.push(`${deal.client}’s contract says ${money(value, cur)} but the quote was ${money(quoted, cur)}`);
          addApproval(s, { agentId: me.id, kind: 'contract', refId: deal.id, title: `Contract for ${deal.client} doesn’t match`, sub: `Contract ${money(value, cur)} vs quote ${money(quoted, cur)} – check before signing`, body: `The contract from ${deal.client} is for ${money(value, cur)}, but we quoted ${money(quoted, cur)}:\n${deal.quote.map((l) => `• ${l.item} – ${money(l.price, cur)}`).join('\n')}\n\nApprove to sign it anyway, or decline and I’ll ask them to correct it.` });
        } else {
          deal.contract.status = 'checked';
          out.fixed.push(`Checked ${deal.client}’s contract – matches the quote`);
          addApproval(s, { agentId: me.id, kind: 'contract', refId: deal.id, title: `${deal.client} contract is ready to sign`, sub: `${money(value || quoted, cur)} · matches your quote`, body: `Contract checked against the quote – every line matches (${money(value || quoted, cur)}).\n\nApprove to sign and send it back.` });
        }
      }
    }
    // Leads that went cold – reach back out.
    for (const lead of s.leads) {
      if (lead.status === 'cold' && !lead.revivedAt && daysSince(lead.lastReplyAt || lead.receivedAt) >= cfg.coldDays) {
        addApproval(s, { agentId: me.id, kind: 'revive', refId: lead.id, title: `Check-in for ${lead.name} is ready`, sub: `Went cold ${daysSince(lead.lastReplyAt || lead.receivedAt)} days ago`, body: `Hi ${firstName(lead.name)},\n\nYou got in touch a while back about ${lead.need || 'automating part of your business'}. We’ve just finished a similar project and it saved them about 6 hours a week, so I thought of you.\n\nStill something you’re thinking about? Happy to send over a couple of ideas – no obligation.\n\nBest,\n${s.profile.owner}` });
      }
    }
    // Clients due a rebook.
    for (const c of s.clients) {
      if (c.rebookDue && daysUntil(c.rebookDue) <= cfg.rebookWindowDays && !c.rebookPitchedAt) {
        addApproval(s, { agentId: me.id, kind: 'rebook', refId: c.id, title: `Rebook pitch for ${c.name} is ready`, sub: `Due ${shortDate(c.rebookDue)} · ${c.services || 'existing client'}`, body: `Hi ${firstName(c.contact)},\n\nHope everything’s running smoothly with ${c.services || 'your setup'}! Now it’s been bedded in, I’ve got a couple of ideas that could save you even more time – including keeping it all looked after for you each month.\n\nFancy a quick 15-minute catch-up this week? ${s.profile.bookingLink}\n\nBest,\n${s.profile.owner}` });
      }
    }
    if (nudges) out.needs.push(`${nudges} follow up${nudges === 1 ? '' : 's'} for deals that went quiet`);
    if (drafted) out.fixed.unshift(`Drafted ${drafted} quote${drafted === 1 ? '' : 's'} from your rate card`);
    const threads = s.deals.filter((d) => DEAL_OPEN.includes(d.stage)).length;
    out.summary = `Checked ${threads} open deal${threads === 1 ? '' : 's'}, ${drafted} new draft${drafted === 1 ? '' : 's'}, ${nudges} follow up${nudges === 1 ? '' : 's'}.`;
  },

  projects(s, me, out) {
    const live = s.projects.filter((p) => p.stage !== 'Live');
    for (const p of live) {
      if (p.stage === 'Signed' && !p.kickoff) {
        let k = addDaysIso(2);
        const wd = new Date(k + 'T12:00:00').getDay();
        if (wd === 0) k = addDaysIso(3); if (wd === 6) k = addDaysIso(4);
        p.kickoff = k; p.stage = 'Kickoff';
        s.events.push({ id: uid('e'), date: k, type: 'Call', title: `Kickoff – ${p.client}`, detail: p.title, auto: true });
        out.fixed.push(`Booked the ${p.client} kickoff call for ${shortDate(k)}`);
      }
      if (p.due && daysSince(p.due) > 0) out.needs.push(`${p.client} – ${p.title} is ${daysSince(p.due)} day${daysSince(p.due) === 1 ? '' : 's'} past due`);
      if (/content|script|video|tiktok|reel/i.test(p.title) && !s.scripts.some((sc) => sc.client === p.client)) {
        const sw = agentFor(s, 'scripts');
        for (let i = 1; i <= 3; i++) s.scripts.push({ id: uid('s'), title: `${p.client} – video ${i}`, client: p.client, platform: 'TikTok', postBy: addDaysIso(3 + i * 2), status: 'brief', hook: '', body: '', cta: '' });
        if (sw) log(s, me.id, sw.id, `${p.client} content is signed – first 3 briefs are in your queue`);
      }
    }
    // Signed deals with no project yet → open one.
    for (const deal of s.deals) {
      if (deal.stage === 'won' && deal.contract?.status === 'signed' && !s.projects.some((p) => p.dealId === deal.id || (p.client === deal.client && p.value === dealValue(deal)))) {
        s.projects.unshift({ id: uid('p'), client: deal.client, title: deal.want, value: dealValue(deal), stage: 'Signed', due: deal.deadline || addDaysIso(21), kickoff: '', notes: '', dealId: deal.id });
        out.fixed.push(`Opened a new job for ${deal.client}`);
      }
    }
    const mism = s.deals.filter((d) => d.stage === 'won' && d.contract?.status === 'received').length;
    if (!mism) out.fixed.push('Every signed job matches its quote');
    // Client results: keep every brand on course for its goal.
    let onTrack = 0;
    for (const r of s.results || []) {
      const p = progress(r);
      const fmt = (v) => (r.unit === '£' || r.unit === s.profile.currency ? money(v, s.profile.currency) : `${Math.round(v).toLocaleString('en-GB')} ${r.unit || ''}`.trim());
      if (p.status === 'behind') out.needs.push(`${r.client} is behind: ${fmt(p.now)} now, should be near ${fmt(p.expected)} by day ${p.day}`);
      else onTrack++;
      if (checkinDue(r)) out.needs.push(`Log ${r.client}’s ${String(r.metric || 'result').toLowerCase()} for month ${monthOf(r)}`);
      const quiet = quietDays(r);
      if (quiet >= 2 && (!r.nudgedAt || daysSince(r.nudgedAt) >= 3)) {
        const body = `Hi ${firstName(r.contact || r.client)},\n\nQuick check-in – I can see the daily actions haven’t been ticked off for ${quiet} days. Totally normal to have a busy patch, but these are the small things that add up to ${fmt(r.goal)} a month.\n\nToday, just pick one: ${(r.actions || [])[0]?.title || 'your first action'}. I’ll check in again tomorrow.\n\n${s.profile.owner}`;
        if (me.autonomy === 'auto') { r.nudgedAt = nowIso(); log(s, me.id, 'you', `Nudged ${r.client} – ${quiet} quiet days`); out.fixed.push(`Nudged ${r.client} after ${quiet} quiet days`); }
        else addApproval(s, { agentId: me.id, kind: 'results-nudge', refId: r.id, title: `Nudge to ${r.client} is ready`, sub: `No daily actions ticked for ${quiet} days`, body });
      }
    }
    if ((s.results || []).length) out.fixed.push(`${onTrack} of ${s.results.length} clients on track for their goal`);
    out.summary = `${live.length} live job${live.length === 1 ? '' : 's'} and ${(s.results || []).length} client goals checked.`;
  },

  scripts(s, me, out) {
    let written = 0;
    for (const sc of s.scripts) {
      if (sc.status === 'brief') {
        writeScript(s, sc);
        written++;
      }
      if (sc.status === 'drafted') {
        if (me.autonomy === 'auto') { sc.status = 'approved'; out.fixed.push(`Approved “${sc.title}” (you let me sign off)`); continue; }
        addApproval(s, { agentId: me.id, kind: 'script', refId: sc.id, title: `Script for ${sc.title} is ready to sign off`, sub: `Hook first, in your voice · post by ${shortDate(sc.postBy)}`, body: `HOOK\n${sc.hook}\n\nBODY\n${sc.body}\n\nCTA\n${sc.cta}` });
        if (sc.postBy && daysUntil(sc.postBy) <= 2) out.needs.push(`Sign off “${sc.title}” – posts ${shortDate(sc.postBy)}`);
      }
    }
    if (written) out.fixed.push(`Wrote ${written} script${written === 1 ? '' : 's'} from the brief${written === 1 ? '' : 's'}`);
    const waiting = s.scripts.filter((x) => x.status === 'drafted').length;
    out.summary = `${written} new script${written === 1 ? '' : 's'} written, ${waiting} waiting for your sign-off.`;
  },

  finance(s, me, out) {
    const cur = s.profile.currency;
    const c = s.settings.chase;
    for (const inv of s.invoices) {
      if (inv.status === 'paid' && inv.paidAt && daysSince(inv.paidAt) <= 1 && !inv.matched) {
        inv.matched = true;
        out.fixed.push(`${money(inv.amount, cur)} from ${inv.client} matched to ${inv.number}`);
        log(s, me.id, 'you', `${money(inv.amount, cur)} from ${inv.client} matched to ${inv.number}`);
      }
      if (inv.status === 'sent' && inv.due && daysSince(inv.due) > 0) {
        inv.status = 'overdue';
        out.fixed.push(`Marked ${inv.number} (${inv.client}) overdue`);
      }
      if (inv.status === 'draft') {
        addApproval(s, { agentId: me.id, kind: 'invoice', refId: inv.id, title: `Invoice for ${inv.client} is ready`, sub: `${inv.title} · ${money(inv.amount, cur)}`, body: `${inv.number} – ${inv.title}\nAmount: ${money(inv.amount, cur)}\nDue: 14 days from sending\n\nApprove to send it with a card-payment link.` });
      }
      if (inv.status === 'overdue') {
        const late = daysSince(inv.due);
        const steps = [['friendly', c.friendlyAfter], ['firmer', c.firmerAfter], ['final', c.finalAfter]];
        const done = (inv.chases || []).length;
        const next = steps[done];
        if (next && late >= next[1]) {
          const body = chaseText(s, inv, next[0]);
          if (me.autonomy === 'auto') { applyChase(s, inv, next[0]); out.fixed.push(`Sent a ${next[0]} reminder to ${inv.client} (${money(inv.amount, cur)}, ${late} days late)`); }
          else addApproval(s, { agentId: me.id, kind: 'chase', refId: inv.id, title: `${next[0][0].toUpperCase()}${next[0].slice(1)} reminder to ${inv.client} is ready`, sub: `${inv.number} · ${money(inv.amount, cur)} · ${late} days late`, body });
        }
        if (late >= c.callAfter) out.needs.push(`Call ${inv.client} about ${inv.number} (${money(inv.amount, cur)}, ${late} days late)`);
      }
    }
    // Newly signed deals → deposit invoice.
    for (const deal of s.deals) {
      if (deal.stage === 'won' && deal.contract?.status === 'signed' && !deal.invoiced) {
        deal.invoiced = true;
        const inv = { id: uid('i'), number: nextInvoiceNumber(s), client: deal.client, title: `Deposit – ${deal.want}`, amount: Math.round(dealValue(deal) / 2), issued: '', due: '', status: 'draft', chases: [] };
        s.invoices.unshift(inv);
        addApproval(s, { agentId: me.id, kind: 'invoice', refId: inv.id, title: `Deposit invoice for ${deal.client} is ready`, sub: `50% of ${money(dealValue(deal), cur)}`, body: `${inv.number} – ${inv.title}\nAmount: ${money(inv.amount, cur)} (50% deposit)\n\nApprove to send it with a card-payment link.` });
      }
    }
    const owed = sum(s.invoices.filter((i) => ['sent', 'overdue'].includes(i.status)), (i) => i.amount);
    const overdue = s.invoices.filter((i) => i.status === 'overdue');
    out.summary = `Checked ${s.invoices.length} invoices: ${money(owed, cur)} owed, ${overdue.length} overdue.`;
  },
};

export function nextInvoiceNumber(s) {
  const max = Math.max(1000, ...s.invoices.map((i) => Number(String(i.number).replace(/\D/g, '')) || 0));
  return `INV-${max + 1}`;
}

export function chaseText(s, inv, step) {
  const cur = s.profile.currency;
  const t = {
    friendly: `Hi there,\n\nJust a friendly reminder that ${inv.number} for ${money(inv.amount, cur)} (${inv.title}) was due on ${shortDate(inv.due)}. If it’s already on its way, please ignore this!\n\nThanks,\n${s.profile.owner}`,
    firmer: `Hi there,\n\n${inv.number} for ${money(inv.amount, cur)} is now ${daysSince(inv.due)} days overdue. Could you let me know when payment will be made? You can pay by card here in under a minute.\n\nThanks,\n${s.profile.owner}`,
    final: `Hi there,\n\nThis is a final reminder that ${inv.number} for ${money(inv.amount, cur)} is ${daysSince(inv.due)} days overdue. Please arrange payment within 7 days to avoid any pause to your services.\n\nThanks,\n${s.profile.owner}`,
  };
  return t[step] || t.friendly;
}

export function writeScript(s, sc) {
  const topic = sc.title.replace(/^.*?–\s*/, '');
  sc.hook = sc.hook || `Stop scrolling if you run ${sc.client === s.profile.business ? 'a small business' : sc.client} – ${topic.toLowerCase()}.`;
  sc.body = sc.body || `Here’s the thing nobody tells you about ${topic.toLowerCase()}: it’s costing you more than you think. One quick change – and I’ll show you exactly what we did for a client last month – means it’s handled for you, even when you’re flat out.`;
  sc.cta = sc.cta || (sc.client === s.profile.business ? 'Comment “SYSTEM” and I’ll send you the exact setup.' : `Follow ${sc.client} for more tips like this.`);
  sc.status = 'drafted';
}

// ── Doing things after your sign-off ─────────────────────────────────────────
export function sendDeal(s, deal, me) {
  deal.stage = 'sent';
  deal.lastContactAt = nowIso();
  deal.sentAt = nowIso();
  log(s, me?.id || 'deals', 'you', `Quote sent to ${deal.client} (${money(dealValue(deal), s.profile.currency)})`);
}
export function applyFollowUp(s, deal, body) {
  deal.followUps = (deal.followUps || 0) + 1;
  deal.lastContactAt = nowIso();
  deal.lastFollowUp = body;
}
export function applyChase(s, inv, step) {
  inv.chases = [...(inv.chases || []), { at: nowIso(), step }];
  log(s, agentFor(s, 'finance')?.id || 'finance', 'you', `Sent a ${step} reminder to ${inv.client} for ${inv.number}`);
}

/** Carries out an approved item. `body` is the (possibly edited) text. */
export function approve(s, ap, body) {
  const me = agentById(s, ap.agentId) || { id: ap.agentId };
  const deal = s.deals.find((d) => d.id === ap.refId);
  const lead = s.leads.find((l) => l.id === ap.refId);
  const inv = s.invoices.find((i) => i.id === ap.refId);
  switch (ap.kind) {
    case 'reply': if (deal) { deal.draft = body; sendDeal(s, deal, me); } break;
    case 'followup': if (deal) { applyFollowUp(s, deal, body); log(s, me.id, 'you', `Follow up sent to ${deal.client}`); } break;
    case 'contract': if (deal) {
      deal.contract.status = 'signed';
      log(s, me.id, 'you', `${deal.client} contract signed and sent back`);
      const pm = agentFor(s, 'projects'); const fin = agentFor(s, 'finance');
      if (pm) log(s, me.id, pm.id, `${deal.client} signed (${money(dealValue(deal), s.profile.currency)}) – over to you`);
      if (fin) log(s, me.id, fin.id, `${deal.client} signed – please raise the 50% deposit`);
    } break;
    case 'script': { const sc = s.scripts.find((x) => x.id === ap.refId); if (sc) { sc.status = 'approved'; log(s, me.id, 'you', `“${sc.title}” signed off – ready to film`); } } break;
    case 'chase': if (inv) applyChase(s, inv, ['friendly', 'firmer', 'final'][(inv.chases || []).length] || 'final'); break;
    case 'invoice': if (inv) { inv.status = 'sent'; inv.issued = today(); inv.due = addDaysIso(14); log(s, me.id, 'you', `${inv.number} sent to ${inv.client} (${money(inv.amount, s.profile.currency)})`); } break;
    case 'lead-reply': if (lead) { lead.thread = [...(lead.thread || []), { from: 'us', text: body, at: nowIso() }]; lead.status = 'replied'; lead.lastReplyAt = nowIso(); } break;
    case 'revive': if (lead) { lead.thread = [...(lead.thread || []), { from: 'us', text: body, at: nowIso() }]; lead.revivedAt = nowIso(); lead.status = 'replied'; lead.lastReplyAt = nowIso(); log(s, me.id, 'you', `Checked back in with ${lead.name}`); } break;
    case 'rebook': { const c = s.clients.find((x) => x.id === ap.refId); if (c) { c.rebookPitchedAt = nowIso(); log(s, me.id, 'you', `Rebook pitch sent to ${c.name}`); } } break;
    case 'results-nudge': { const r = (s.results || []).find((x) => x.id === ap.refId); if (r) { r.nudgedAt = nowIso(); log(s, me.id, 'you', `Nudge sent to ${r.client}`); } } break;
    default: log(s, me.id, 'you', `Done: ${ap.title}`);
  }
  s.approvals = s.approvals.filter((x) => x.id !== ap.id);
}

export function decline(s, ap) {
  const deal = s.deals.find((d) => d.id === ap.refId);
  if (ap.kind === 'contract' && deal) { deal.contract.status = 'none'; log(s, ap.agentId, 'you', `Asked ${deal.client} to correct their contract`); }
  if (ap.kind === 'followup' && deal) deal.lastContactAt = nowIso(); // snooze
  if (ap.kind === 'rebook') { const c = s.clients.find((x) => x.id === ap.refId); if (c) c.rebookPitchedAt = nowIso(); }
  if (ap.kind === 'revive') { const l = s.leads.find((x) => x.id === ap.refId); if (l) l.revivedAt = nowIso(); }
  if (ap.kind === 'script') { const sc = s.scripts.find((x) => x.id === ap.refId); if (sc) sc.status = 'brief'; }
  if (ap.kind === 'results-nudge') { const r = (s.results || []).find((x) => x.id === ap.refId); if (r) r.nudgedAt = nowIso(); }
  s.approvals = s.approvals.filter((x) => x.id !== ap.id);
}

// ── Running the team ─────────────────────────────────────────────────────────
/**
 * Runs one agent. `ai` is an optional async function used for agents you add
 * yourself (they follow their written instructions via Claude).
 */
export async function runAgent(s, agent, ai) {
  const out = { at: nowIso(), summary: '', needs: [], fixed: [] };
  if (agent.enabled === false) return null;
  if (RUNS[agent.builtIn]) RUNS[agent.builtIn](s, agent, out);
  else if (ai) {
    try {
      const r = await ai(agent, snapshot(s));
      Object.assign(out, { summary: r.summary, needs: r.needs || [], fixed: r.fixed || [] });
      for (const m of r.messages || []) {
        const to = s.agents.find((a) => a.name.toLowerCase() === String(m.to).toLowerCase());
        log(s, agent.id, to?.id || 'you', m.text);
      }
    } catch (err) {
      out.summary = `Couldn’t run: ${err.message}`;
    }
  } else {
    out.summary = 'Waiting for Claude – connect it to let this agent follow its instructions.';
  }
  s.updates[agent.id] = out;
  return out;
}

export async function runAll(s, ai) {
  for (const a of s.agents) await runAgent(s, a, ai);
  // A second pass lets work handed between agents this morning get picked up.
  for (const a of s.agents.filter((x) => x.builtIn)) {
    const before = s.updates[a.id];
    const again = { at: nowIso(), summary: '', needs: [], fixed: [] };
    if (RUNS[a.builtIn] && a.enabled !== false) {
      RUNS[a.builtIn](s, a, again);
      s.updates[a.id] = { ...before, needs: dedupe([...(before?.needs || []), ...again.needs]), fixed: dedupe([...(before?.fixed || []), ...again.fixed]) };
    }
  }
  s.meta.lastRunDate = today();
  s.meta.lastRunAt = nowIso();
}
const dedupe = (arr) => [...new Set(arr)];

/** A compact view of the business, handed to Claude for custom agents. */
export function snapshot(s) {
  return {
    today: today(), business: s.profile.business,
    leads: s.leads.slice(0, 30).map(({ name, business, channel, need, budget, status, receivedAt }) => ({ name, business, channel, need, budget, status, receivedAt })),
    deals: s.deals.slice(0, 30).map((d) => ({ client: d.client, want: d.want, stage: d.stage, value: dealValue(d), lastContactAt: d.lastContactAt })),
    projects: s.projects.map(({ client, title, stage, due }) => ({ client, title, stage, due })),
    invoices: s.invoices.slice(0, 40).map(({ number, client, amount, status, due }) => ({ number, client, amount, status, due })),
    scripts: s.scripts.map(({ title, client, status, postBy }) => ({ title, client, status, postBy })),
    clients: s.clients.map(({ name, services, retainer, rebookDue }) => ({ name, services, retainer, rebookDue })),
    results: (s.results || []).map((r) => ({ client: r.client, metric: r.metric, baseline: r.baseline, goal: r.goal, now: progress(r).now, status: progress(r).status, day: progress(r).day })),
    events: s.events.filter((e) => daysUntil(e.date) >= 0 && daysUntil(e.date) <= 14),
  };
}

// ── Numbers for the briefing ────────────────────────────────────────────────
export function quarterRange(s) {
  const start = new Date((s.profile.quarterStart || today()) + 'T00:00:00');
  const end = new Date(start); end.setMonth(end.getMonth() + 3);
  return [start, end];
}
export function earnings(s) {
  const [start, end] = quarterRange(s);
  const inQ = (iso) => iso && new Date(iso) >= start && new Date(iso) < end;
  const received = s.invoices.filter((i) => i.status === 'paid' && inQ(i.paidAt || i.issued));
  const owed = s.invoices.filter((i) => ['sent', 'overdue'].includes(i.status));
  const pipelineDeals = s.deals.filter((d) => DEAL_OPEN.includes(d.stage) || (d.stage === 'won' && !d.invoiced && d.contract?.status !== 'signed'));
  const byClient = {};
  for (const i of [...received, ...owed]) byClient[i.client] = (byClient[i.client] || 0) + Number(i.amount || 0);
  const won = s.deals.filter((d) => d.stage === 'won').length + s.projects.filter((p) => !p.dealId && !s.deals.some((d) => d.client === p.client && d.stage === 'won')).length;
  return {
    received: sum(received, (i) => i.amount), owed: sum(owed, (i) => i.amount), overdue: sum(owed.filter((i) => i.status === 'overdue'), (i) => i.amount),
    pipeline: sum(pipelineDeals, dealValue), won, byClient,
    counts: { received: received.length, owed: owed.length, pipeline: pipelineDeals.length },
  };
}

/** The headline bullets on each agent's team card. */
export function cardBullets(s, a) {
  const cur = s.profile.currency;
  const pending = s.approvals.filter((x) => x.agentId === a.id).length;
  switch (a.builtIn) {
    case 'receptionist': {
      const auto = s.leads.filter((l) => (l.thread || []).some((m) => m.from === 'auto')).length;
      return [`${auto} enquir${auto === 1 ? 'y' : 'ies'} answered automatically`, `Auto-replies are ${s.settings.autoReply.enabled ? 'ON – replies in under a minute' : 'OFF – drafts wait for you'}`,
        `${s.leads.filter((l) => l.status === 'handed').length} leads handed to the Deal Manager`, `${s.leads.filter((l) => l.status === 'scam').length} flagged as scams`, `${s.leads.filter((l) => l.status === 'cold').length} cold leads in nurture`];
    }
    case 'deals': {
      const open = s.deals.filter((d) => DEAL_OPEN.includes(d.stage));
      const best = [...open].sort((x, y) => dealValue(y) - dealValue(x))[0];
      return [`${s.approvals.filter((x) => x.kind === 'followup').length} follow ups ready for deals that went quiet`, `${s.approvals.filter((x) => x.kind === 'reply').length} replies drafted and waiting for you`,
        best ? `Best lead: ${best.client} at ${money(dealValue(best), cur)}` : 'No open deals right now', `${s.deals.filter((d) => d.sentAt && daysSince(d.sentAt) <= 7).length} sent this week`, `${s.approvals.filter((x) => x.kind === 'rebook').length} clients due a rebook pitch`];
    }
    case 'projects': {
      const live = s.projects.filter((p) => p.stage !== 'Live');
      const week = live.filter((p) => p.due && daysUntil(p.due) >= 0 && daysUntil(p.due) <= 7);
      const late = live.filter((p) => p.due && daysSince(p.due) > 0);
      const mism = s.deals.filter((d) => d.stage === 'won' && d.contract?.status === 'received').length;
      return [`${live.length} live jobs on the board`, week.length ? `${week.length} due this week: ${week[0].client}` : 'Nothing due this week', late.length ? `${late.length} job${late.length === 1 ? '' : 's'} past due` : 'No stalled jobs',
        mism ? `${mism} contract${mism === 1 ? '' : 's'} to check` : 'Contracts all match your quotes', `${(s.results || []).filter((r) => progress(r).status !== 'behind').length} of ${(s.results || []).length} clients on track for their goal`];
    }
    case 'scripts':
      return [`${s.scripts.filter((x) => x.status === 'brief').length} briefs waiting to be written`, `${s.scripts.filter((x) => x.status === 'drafted').length} scripts need your sign-off`, `${s.scripts.filter((x) => x.status === 'approved').length} approved, ready to film`, `${s.scripts.filter((x) => x.status === 'posted').length} posted`];
    case 'finance': {
      const e = earnings(s);
      return [`${money(e.owed, cur)} owed to you`, `${s.invoices.filter((i) => i.status === 'overdue').length} overdue (${money(e.overdue, cur)})`, `${money(sum(s.invoices.filter((i) => i.status === 'paid' && daysSince(i.paidAt) <= 30), (i) => i.amount), cur)} landed in the last 30 days`,
        `Chasers: friendly → firmer → final`, `${pending} item${pending === 1 ? '' : 's'} waiting for you`];
    }
    default: {
      const u = s.updates[a.id];
      return [a.role, u?.summary || 'Not run yet', `${pending} item${pending === 1 ? '' : 's'} waiting for you`];
    }
  }
}

/** Everything happening in the next 7 days, from every part of HQ. */
export function thisWeek(s) {
  const items = [];
  const inWeek = (iso) => iso && daysUntil(iso) >= 0 && daysUntil(iso) <= 7;
  for (const e of s.events) if (inWeek(e.date)) items.push({ date: e.date, type: e.type, title: e.title, detail: e.detail, color: '#22d3ee' });
  for (const p of s.projects) if (p.stage !== 'Live' && inWeek(p.due)) items.push({ date: p.due, type: 'Build due', title: p.client, detail: p.title, color: '#fbbf24' });
  for (const sc of s.scripts) if (sc.status !== 'posted' && inWeek(sc.postBy)) items.push({ date: sc.postBy, type: 'Post by', title: sc.client, detail: sc.title, color: '#a78bfa' });
  for (const i of s.invoices) if (i.status === 'sent' && inWeek(i.due)) items.push({ date: i.due, type: 'Invoice due', title: i.client, detail: `${i.number} · ${money(i.amount, s.profile.currency)}`, color: '#34d399' });
  for (const d of s.deals) if (DEAL_OPEN.includes(d.stage) && inWeek(d.deadline)) items.push({ date: d.deadline, type: 'Deadline', title: d.client, detail: d.want, color: '#3b82f6' });
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export { nameOf };
