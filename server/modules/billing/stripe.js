import { config } from '../../config.js';

/** Card payments through Stripe Checkout. Needs STRIPE_SECRET_KEY; never throws. */
export const stripeReady = () => Boolean(config.stripeSecretKey);

/** Creates a hosted Stripe Checkout page for the amount still owed. Returns { url, id } or { error }. */
export async function createCheckoutSession({ doc, orgName, amountPence, returnUrl }) {
  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'gbp',
    'line_items[0][price_data][product_data][name]': `${orgName} – ${doc.purpose === 'deposit' ? 'deposit' : doc.kind} ${doc.number}`,
    'line_items[0][price_data][unit_amount]': String(amountPence),
    'line_items[0][quantity]': '1',
    success_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}paid=1`,
    cancel_url: returnUrl,
    client_reference_id: doc.id,
    'metadata[invoice_id]': doc.id,
    'metadata[org_id]': doc.org_id,
    'payment_intent_data[metadata][invoice_id]': doc.id,
  });
  if (doc.contact_email) form.set('customer_email', doc.contact_email);
  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.stripeSecretKey}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error?.message || `Stripe responded ${res.status}` };
    return { url: data.url, id: data.id };
  } catch (err) {
    return { error: `Stripe unreachable: ${err.message}` };
  }
}
