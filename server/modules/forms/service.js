import { parseJson } from '../../db/index.js';
import { publicLink } from '../../lib/links.js';
import { toE164 } from '../../lib/phone.js';
import { badRequest, id, notFound, now } from '../../lib/util.js';
import { getContactRow, logActivity, upsertContact } from '../crm/service.js';
import { deliverMessage, queueMessage } from '../messaging/service.js';

/**
 * Lead capture forms for the business's website, Facebook page or link in bio.
 * Each submission creates or updates the contact, thanks the customer and runs
 * the new-lead automations.
 */

export const FIELD_TYPES = ['text', 'email', 'tel', 'textarea', 'select', 'checkbox', 'postcode'];
// Fields that fill in the contact record; anything else is kept with the submission.
export const CONTACT_FIELDS = ['first_name', 'last_name', 'email', 'phone', 'company', 'address', 'postcode'];

export const DEFAULT_FIELDS = [
  { key: 'first_name', label: 'First name', type: 'text', required: true },
  { key: 'last_name', label: 'Last name', type: 'text', required: false },
  { key: 'email', label: 'Email', type: 'email', required: false },
  { key: 'phone', label: 'Mobile number', type: 'tel', required: true },
  { key: 'message', label: 'How can we help?', type: 'textarea', required: false },
];

export function cleanFields(fields) {
  if (!Array.isArray(fields) || !fields.length) throw badRequest('A form needs at least one field');
  const seen = new Set();
  const out = fields.slice(0, 30).map((f, i) => {
    const label = String(f.label || '').trim().slice(0, 120);
    if (!label) throw badRequest(`Field ${i + 1} needs a label`);
    const key = String(f.key || label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || `field_${i + 1}`;
    if (seen.has(key)) throw badRequest(`Two fields use the name “${key}”`);
    seen.add(key);
    const type = FIELD_TYPES.includes(f.type) ? f.type : 'text';
    const options = type === 'select' ? (Array.isArray(f.options) ? f.options : String(f.options || '').split(',')).map((o) => String(o).trim()).filter(Boolean).slice(0, 30) : undefined;
    if (type === 'select' && !options.length) throw badRequest(`“${label}” needs some options`);
    return { key, label, type, required: Boolean(f.required), ...(options ? { options } : {}), ...(f.placeholder ? { placeholder: String(f.placeholder).slice(0, 120) } : {}) };
  });
  if (!out.some((f) => f.key === 'email' || f.key === 'phone')) throw badRequest('Add an email or phone field so you can reply');
  if (!out.some((f) => f.key === 'first_name')) throw badRequest('Add a “first_name” field');
  return out;
}

export function getForm(db, formId, orgId = null) {
  const form = parseJson(db.get(`SELECT * FROM forms WHERE id = ? ${orgId ? 'AND org_id = ?' : ''}`, ...[formId, ...(orgId ? [orgId] : [])]), 'fields', 'tags');
  if (!form) throw notFound('Form');
  form.link = publicLink(`form/${form.id}`);
  form.embed = `<iframe src="${publicLink(`form/${form.id}?embed=1`)}" title="${form.title.replace(/"/g, '&quot;')}" style="width:100%;max-width:560px;height:640px;border:0" loading="lazy"></iframe>`;
  return form;
}

/** Handles a public submission. Returns { message } for the thank-you screen. */
export async function submitForm(ctx, form, raw = {}) {
  const { db, engine } = ctx;
  if (!form.active) throw badRequest('This form is no longer taking submissions');
  const data = {};
  const errors = [];
  for (const f of form.fields) {
    let value = raw[f.key];
    if (f.type === 'checkbox') value = value === true || value === 'true' || value === 'on';
    else value = value == null ? '' : String(value).trim().slice(0, f.type === 'textarea' ? 3000 : 300);
    if (f.required && (value === '' || value === false)) errors.push(`${f.label} is required`);
    if (value && f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) errors.push(`${f.label} doesn’t look like an email address`);
    if (value && f.type === 'tel' && !toE164(value)) errors.push(`${f.label} doesn’t look like a phone number`);
    if (value && f.type === 'select' && !f.options.includes(value)) errors.push(`Choose an option for ${f.label}`);
    data[f.key] = value;
  }
  if (errors.length) throw badRequest('Please check the form', errors);

  const contactData = { source: 'Website form', tags: form.tags || [] };
  for (const key of CONTACT_FIELDS) if (data[key]) contactData[key] = data[key];
  if (!contactData.first_name) contactData.first_name = 'Website enquiry';
  const { contact, created } = upsertContact(ctx, form.org_id, contactData);
  if (!created && form.tags?.length) {
    db.update('contacts', contact.id, { tags: [...new Set([...(contact.tags || []), ...form.tags])], updated_at: now() });
  }
  const extras = form.fields.filter((f) => !CONTACT_FIELDS.includes(f.key) && data[f.key] !== '' && data[f.key] !== false);
  const summary = extras.map((f) => `${f.label}: ${data[f.key] === true ? 'Yes' : data[f.key]}`).join('\n') || 'No message';
  db.insert('form_submissions', { id: id('sub'), form_id: form.id, org_id: form.org_id, contact_id: contact.id, data, created_at: now() });
  db.run('UPDATE forms SET submissions = submissions + 1, updated_at = ? WHERE id = ?', now(), form.id);
  logActivity(db, form.org_id, contact.id, `Filled in “${form.name}”\n${summary}`);

  if (form.send_thank_you) {
    const queued = queueMessage(ctx, form.org_id, { contactId: contact.id, template: 'form_thank_you', related: { type: 'form', id: form.id }, force: true });
    if (queued.message) await deliverMessage(ctx, queued.message, queued.settings, queued.extra, queued.creds);
  }
  engine.logSystemRun(form.org_id, 'Lead form', 'form.submitted', `“${form.name}” → ${created ? 'new' : 'existing'} contact ${contact.first_name}${form.send_thank_you ? ', thank-you sent' : ''}`, 5);
  engine.emit(form.org_id, 'form.submitted', { form: { id: form.id, name: form.name }, contact: getContactRow(db, contact.id), created, data, summary });
  return { message: form.thank_you, contact_id: contact.id, created };
}
