/**
 * Reads a call transcript (and the caller's notes) and pulls out what matters:
 * the problems they mentioned, objections, buying signals, budget, timeline,
 * who decides, the questions they asked and the agreed next step. The results
 * go onto the lead's record and feed the self-updating call script.
 *
 * Lines can be labelled “You:” / “Them:” (the Twilio transcription and the
 * sample calls are); unlabelled text is treated as the whole conversation.
 */

export const PAINS = [
  { key: 'missed_calls', label: 'Missing calls and enquiries', words: ['missed call', 'miss calls', 'missing calls', 'can’t answer', "can't answer", 'voicemail', 'up a ladder', 'on a job', 'miss enquiries', 'missed enquir'] },
  { key: 'slow_reply', label: 'Slow to reply to leads', words: ['slow to reply', 'get back to people', 'reply late', 'take ages to reply', 'forget to reply', 'lose leads', 'leads go cold'] },
  { key: 'admin', label: 'Too much admin', words: ['admin', 'paperwork', 'evenings', 'spreadsheet', 'weekend doing', 'no time', 'too busy', 'swamped', 'drowning'] },
  { key: 'no_shows', label: 'No-shows and cancellations', words: ['no-show', 'no show', 'didn’t turn up', "didn't turn up", 'cancel last minute', 'last minute cancel', 'forget their appointment'] },
  { key: 'invoices', label: 'Chasing payments', words: ['chasing', 'unpaid', 'invoice', 'late payment', 'owed money', 'cash flow', 'cashflow'] },
  { key: 'quotes', label: 'Quotes not followed up', words: ['quote', 'quotes', 'estimate', 'never hear back'] },
  { key: 'reviews', label: 'Not enough reviews', words: ['review', 'reviews', 'google rating', 'trustpilot', 'reputation'] },
  { key: 'leads', label: 'Not enough leads', words: ['more leads', 'not enough leads', 'need more work', 'quiet month', 'quiet months', 'pipeline', 'new customers', 'more clients', 'more customers'] },
  { key: 'social', label: 'Social media takes too long', words: ['instagram', 'tiktok', 'social media', 'posting', 'content', 'dms', 'dm '] },
  { key: 'bookings', label: 'Booking back-and-forth', words: ['back and forth', 'booking', 'diary', 'calendar', 'scheduling', 'appointments'] },
  { key: 'google', label: 'Not found on Google', words: ['google', 'seo', 'website', 'found online', 'search'] },
  { key: 'staff', label: 'Team and staff', words: ['staff', 'team', 'hiring', 'receptionist', 'assistant', 'employees'] },
];

export const OBJECTIONS = [
  { key: 'price', label: 'Price', words: ['too expensive', 'how much', 'cost', 'price', 'afford', 'budget', 'cheaper'] },
  { key: 'timing', label: 'Timing / busy', words: ['not right now', 'not now', 'too busy', 'bad time', 'call me back', 'next month', 'after christmas', 'in the new year', 'maybe later'] },
  { key: 'existing', label: 'Already have something', words: ['already have', 'already use', 'already got', 'we use', 'happy with', 'got someone'] },
  { key: 'think', label: 'Need to think / ask someone', words: ['think about it', 'have a think', 'talk to my', 'speak to my', 'ask my', 'run it by', 'partner', 'wife', 'husband', 'business partner'] },
  { key: 'send_info', label: '“Send me some info”', words: ['send me', 'email me', 'send some info', 'send information', 'send it over', 'brochure'] },
  { key: 'trust', label: 'Trust / tried before', words: ['tried before', 'didn’t work', "didn't work", 'scam', 'burnt', 'burned', 'waste of money', 'sceptical', 'skeptical'] },
  { key: 'not_interested', label: 'Not interested', words: ['not interested', 'no thanks', 'no thank you', 'don’t need', "don't need", 'take me off'] },
];

const SIGNALS = ['sounds good', 'that would help', 'that’d help', "that'd help", 'interested', 'how soon', 'when can you', 'how does it work', 'what does it cost', 'can you show me', 'book', 'demo', 'let’s do it', "let's do it", 'sign me up', 'that makes sense', 'love that', 'perfect'];

const lines = (text) => String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => {
  const m = l.match(/^(you|me|agent|caller|them|lead|prospect|customer|client)\s*:\s*(.*)$/i);
  if (!m) return { who: null, text: l };
  return { who: /^(you|me|agent|caller)$/i.test(m[1]) ? 'you' : 'them', text: m[2] };
});

const has = (text, words) => words.filter((w) => text.includes(w));

export function analyseTranscript(transcript = '', notes = '') {
  const all = lines(transcript);
  const theirs = all.filter((l) => l.who !== 'you');
  const theirText = ` ${theirs.map((l) => l.text).join(' ').toLowerCase()} `;
  const fullText = ` ${[transcript, notes].join(' ').toLowerCase()} `;
  const pains = PAINS.filter((p) => has(fullText, p.words).length).map((p) => ({ key: p.key, label: p.label }));
  const objections = OBJECTIONS.filter((o) => has(theirText, o.words).length).map((o) => ({ key: o.key, label: o.label }));
  const signals = SIGNALS.filter((s) => theirText.includes(s));
  const budget = ((fullText.match(/£\s?\d[\d,]*(\.\d+)?\s?(k|a month|per month|pm|\/month|a week|per week)?|\$\s?\d[\d,]*(\.\d+)?\s?(k|a month|per month)?|\d+\s?(pounds|quid|grand)/i) || [])[0] || '').trim() || null;
  const timeline = (fullText.match(/\b(asap|right away|this week|next week|this month|next month|in the new year|after christmas|january|february|march|april|may|june|july|august|september|october|november|december|q[1-4]|in \d+ (weeks|months))\b/i) || [])[0] || null;
  const dm = /\b(i decide|my decision|i('| a)m the owner|i run the business|it's my business|it’s my business)\b/.test(fullText) ? 'Yes – they decide'
    : /\b(partner|business partner|my boss|director|wife|husband|the owner|manager)\b/.test(theirText) ? 'Someone else is involved' : null;
  const questions = theirs.filter((l) => l.text.endsWith('?')).map((l) => l.text).slice(0, 8);
  const yourWords = all.filter((l) => l.who === 'you').reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  const theirWords = theirs.filter((l) => l.who === 'them').reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  const labelled = all.some((l) => l.who);
  const talkRatio = labelled && yourWords + theirWords ? Math.round((yourWords / (yourWords + theirWords)) * 100) : null;
  const nextStep = /\bbook(ed)?\b|\bdemo\b|\bcalendar\b|\bthursday\b|\btuesday\b|\bmonday\b|\bwednesday\b|\bfriday\b/.test(fullText) ? 'Meeting / demo discussed'
    : /call (me )?back|ring (me )?back|speak (again|later)/.test(fullText) ? 'Call back' : /send (me|it|some)|email me/.test(fullText) ? 'Send information' : null;
  // Moments from their side worth reading again (pain, objection or buying signal).
  const highlights = theirs.filter((l) => {
    const t = ` ${l.text.toLowerCase()} `;
    return PAINS.some((p) => has(t, p.words).length) || OBJECTIONS.some((o) => has(t, o.words).length) || SIGNALS.some((s) => t.includes(s));
  }).map((l) => l.text).slice(0, 6);
  const summaryBits = [];
  if (pains.length) summaryBits.push(`Problems: ${pains.map((p) => p.label.toLowerCase()).join(', ')}`);
  if (objections.length) summaryBits.push(`Concerns: ${objections.map((o) => o.label.toLowerCase()).join(', ')}`);
  if (signals.length) summaryBits.push(`Buying signals: “${signals.slice(0, 3).join('”, “')}”`);
  if (timeline) summaryBits.push(`Timeline: ${timeline}`);
  if (budget) summaryBits.push(`Budget mentioned: ${budget}`);
  return {
    pains, objections, signals, budget, timeline, decision_maker: dm, questions, talk_ratio: talkRatio, next_step: nextStep, highlights,
    words: all.reduce((n, l) => n + l.text.split(/\s+/).length, 0),
    summary: summaryBits.join(' · ') || (all.length ? 'Nothing specific picked out – add notes on what they said.' : ''),
  };
}

/**
 * In calls that ended booked, the line the caller said straight after the
 * lead raised an objection – what actually worked, to feed the script.
 */
export function winningResponses(transcript) {
  const all = lines(transcript);
  const out = [];
  all.forEach((l, i) => {
    if (l.who !== 'them') return;
    const t = ` ${l.text.toLowerCase()} `;
    const objection = OBJECTIONS.find((o) => has(t, o.words).length);
    const reply = all.slice(i + 1).find((x) => x.who === 'you');
    if (objection && reply && reply.text.split(/\s+/).length >= 6) out.push({ objection: objection.key, said: l.text, reply: reply.text });
  });
  return out;
}
