import { Router } from 'express';
import { parseJson } from '../../db/index.js';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { id, now, pick } from '../../lib/util.js';
import { DEFAULT_FIELDS, cleanFields, getForm } from './service.js';

const formSchema = {
  name: { required: true, max: 120 }, title: { required: true, max: 160 }, intro: { max: 1000 }, fields: { type: 'array' },
  button_label: { max: 40 }, thank_you: { max: 500 }, send_thank_you: { type: 'boolean' }, tags: { type: 'array' }, active: { type: 'boolean' },
};

export function formRoutes({ db }) {
  const r = Router();
  r.use(requireAuth(db));

  r.get('/', (req, res) => {
    res.json(db.all('SELECT id FROM forms WHERE org_id = ? ORDER BY created_at DESC', req.org.id).map((f) => getForm(db, f.id)));
  });

  r.get('/:id', (req, res) => {
    const form = getForm(db, req.params.id, req.org.id);
    form.recent = parseJson(db.all(`SELECT s.*, c.first_name, c.last_name FROM form_submissions s LEFT JOIN contacts c ON c.id = s.contact_id WHERE s.form_id = ? ORDER BY s.created_at DESC LIMIT 50`, form.id), 'data');
    res.json(form);
  });

  r.post('/', requireRole('owner', 'admin'), (req, res) => {
    const body = pick(req.body, formSchema);
    const ts = now();
    const form = {
      id: id('frm'), org_id: req.org.id, name: body.name, title: body.title, intro: body.intro || null,
      fields: cleanFields(body.fields || DEFAULT_FIELDS), button_label: body.button_label || 'Send',
      thank_you: body.thank_you || 'Thanks – we’ve got your message and will be in touch shortly.',
      send_thank_you: body.send_thank_you === false ? 0 : 1, tags: body.tags || [], active: 1, submissions: 0, created_at: ts, updated_at: ts,
    };
    db.insert('forms', form);
    res.status(201).json(getForm(db, form.id));
  });

  r.patch('/:id', requireRole('owner', 'admin'), (req, res) => {
    getForm(db, req.params.id, req.org.id);
    const patch = pick(req.body, formSchema, { partial: true });
    if (patch.fields) patch.fields = cleanFields(patch.fields);
    for (const k of ['name', 'title', 'thank_you', 'button_label']) if (patch[k] === null) delete patch[k];
    db.update('forms', req.params.id, { ...patch, updated_at: now() });
    res.json(getForm(db, req.params.id));
  });

  r.delete('/:id', requireRole('owner', 'admin'), (req, res) => {
    getForm(db, req.params.id, req.org.id);
    db.run('DELETE FROM forms WHERE id = ?', req.params.id);
    res.json({ ok: true });
  });

  return r;
}
