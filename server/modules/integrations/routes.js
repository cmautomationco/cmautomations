import { Router } from 'express';
import { config } from '../../config.js';
import { requireAuth, requireRole } from '../../lib/auth.js';
import { toE164 } from '../../lib/phone.js';
import { badRequest, pick } from '../../lib/util.js';
import { getMessagingSettings, sendMessage } from '../messaging/service.js';
import {
  KINDS, apiBase, checkEmail, checkStripe, checkTwilio, configureTwilioNumbers, connectionStatus, createStripeWebhook,
  getCredentials, removeCredentials, saveCredentials,
} from './service.js';

/** Settings → Connections: the business's Twilio, Stripe and email accounts. */
export function integrationRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.use(requireAuth(db));
  const admin = requireRole('owner', 'admin');
  const live = () => { if (config.demoMode) throw badRequest('This is the test build – connect your accounts on your live server.'); };
  const numbers = (orgId) => { const s = getMessagingSettings(db, orgId); return [s.business_number, s.whatsapp_number].filter(Boolean); };

  r.get('/', (req, res) => {
    const base = apiBase();
    res.json({
      status: connectionStatus(db, req.org.id),
      demo: config.demoMode,
      is_client: Boolean(req.org.agency_id),
      numbers: numbers(req.org.id),
      setup: {
        public_url: base, https: /^https:\/\//.test(base),
        voice_url: `${base}/api/hooks/twilio/voice`, messaging_url: `${base}/api/hooks/twilio/messages`, status_url: `${base}/api/hooks/twilio/status`,
        stripe_webhook_url: `${base}/api/hooks/stripe/${req.org.id}`,
      },
    });
  });

  r.put('/:kind', admin, (req, res) => {
    live();
    if (!KINDS.includes(req.params.kind)) throw badRequest('Unknown connection');
    res.json(saveCredentials(db, req.org.id, req.params.kind, req.body || {}));
  });

  r.delete('/:kind', admin, (req, res) => {
    removeCredentials(db, req.org.id, req.params.kind);
    res.json(connectionStatus(db, req.org.id));
  });

  /** Checks a connection against the real service and explains any problem. */
  r.post('/:kind/check', admin, async (req, res) => {
    live();
    const creds = getCredentials(db, req.org.id);
    if (req.params.kind === 'twilio') return res.json(await checkTwilio(creds.twilio, numbers(req.org.id)));
    if (req.params.kind === 'stripe') return res.json(await checkStripe(creds.stripe));
    if (req.params.kind === 'email') return res.json(await checkEmail(creds.email));
    throw badRequest('Unknown connection');
  });

  /** Points the business's Twilio numbers at this system, so calls and texts arrive here. */
  r.post('/twilio/connect-numbers', admin, async (req, res) => {
    live();
    const creds = getCredentials(db, req.org.id);
    if (!creds.twilio) throw badRequest('Connect Twilio first');
    if (!numbers(req.org.id).length) throw badRequest('Add your business number in Settings → Phone & WhatsApp first');
    res.json(await configureTwilioNumbers(creds.twilio, numbers(req.org.id)));
  });

  /** Creates the Stripe webhook for this business and stores its signing secret. */
  r.post('/stripe/webhook', admin, async (req, res) => {
    live();
    const creds = getCredentials(db, req.org.id);
    if (!creds.stripe) throw badRequest('Connect Stripe first');
    if (creds.stripe.source !== 'business') throw badRequest('This business uses the server’s Stripe account – set STRIPE_WEBHOOK_SECRET on the server instead');
    const result = await createStripeWebhook(creds.stripe, req.org.id);
    if (result.ok) saveCredentials(db, req.org.id, 'stripe', { webhookSecret: result.secret });
    res.json({ ok: result.ok, message: result.ok ? 'Stripe will now tell this system the moment an invoice is paid.' : result.message, url: result.url });
  });

  /** Sends a real test message to the owner's own phone or email. */
  r.post('/test-message', admin, async (req, res) => {
    live();
    const body = pick(req.body, { channel: { required: true, enum: ['whatsapp', 'sms', 'email'] }, to: { required: true, max: 200 } });
    if (body.channel !== 'email' && !toE164(body.to)) throw badRequest('Enter a mobile number like 07700 900123');
    const { message, skipped } = await sendMessage(ctx, req.org.id, {
      to: body.to, channel: body.channel, strict: true, force: true, audience: 'system', actorId: req.user.id,
      subject: 'Test message – your emails are connected',
      body: `This is a test from ${req.org.name}. If you can read this, ${body.channel === 'email' ? 'email' : body.channel === 'whatsapp' ? 'WhatsApp' : 'text messages'} are connected ✅`,
    });
    if (!message) throw badRequest(skipped);
    const explain = message.status === 'demo' ? 'Not sent – this channel isn’t connected yet, so it ran in demo mode.' : message.status === 'blocked' ? message.error : null;
    res.json({ status: message.status, error: message.error || explain, provider: message.provider, provider_id: message.provider_id });
  });

  return r;
}
