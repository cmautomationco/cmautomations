/**
 * WhatsApp message templates. Outside the 24 hours after a customer last wrote
 * to the business, WhatsApp only delivers messages that Meta has approved in
 * advance, with numbered placeholders ({{1}}, {{2}}…). This turns each of our
 * message wordings into that form, so a business can copy it into Twilio's
 * Content Template Builder, and fills in the numbers when sending.
 *
 * Meta's rules handled here: placeholders can't be empty, can't sit next to
 * each other, and the text can't start or end with one.
 */

// Our optional bits (" Sam", ", Sam", " at 12 High St") become plain placeholders.
const REWRITES = [
  [/\{\{\s*first_name_spaced\s*\}\}/g, ' {{first_name}}'],
  [/\{\{\s*first_name_comma\s*\}\}/g, ', {{first_name}}'],
  [/\{\{\s*address_line\s*\}\}/g, ' at {{address}}'],
  [/\{\{\s*urgent_line\s*\}\}/g, ''],
];

/** What to put in a placeholder we have no value for (WhatsApp rejects empty ones). */
export const FALLBACKS = {
  first_name: 'there', address: 'the address you gave us', booking_link: 'our website', review_link: 'Google', staff: 'Our engineer',
  eta: 'shortly', service: 'appointment', business: 'us',
};

export function whatsappTemplate(body) {
  let src = String(body || '');
  for (const [pattern, replacement] of REWRITES) src = src.replace(pattern, replacement);
  const variables = [];
  let text = src.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name) => {
    let i = variables.indexOf(name);
    if (i < 0) { variables.push(name); i = variables.length - 1; }
    return `{{${i + 1}}}`;
  });
  text = text.replace(/\}\}\{\{/g, '}} {{').trim();
  if (/^\{\{\d+\}\}/.test(text)) text = `Hi! ${text}`;
  if (/\{\{\d+\}\}$/.test(text)) text = `${text} Thanks!`;
  return { text, variables };
}

/** The values for an approved template, in the order its placeholders are numbered. */
export function contentVariables(body, vars) {
  const { variables } = whatsappTemplate(body);
  return Object.fromEntries(variables.map((name, i) => {
    const value = String(vars[name] ?? '').trim();
    return [String(i + 1), value || FALLBACKS[name] || '-'];
  }));
}

/** Customer messages that can go out more than 24 hours after the customer last wrote. */
export const TEMPLATE_NEEDED = [
  'booking_confirmation', 'booking_reminder_24h', 'booking_reminder_2h', 'booking_moved', 'booking_cancelled', 'booking_on_my_way', 'booking_no_show',
  'booking_review_request', 'deposit_request', 'missed_call', 'new_lead_welcome', 'quote_sent', 'invoice_sent', 'invoice_reminder_1', 'invoice_reminder_2', 'invoice_paid_thanks',
];
