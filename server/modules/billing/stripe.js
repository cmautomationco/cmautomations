/**
 * Card payments through Stripe Checkout, using the business's own Stripe
 * account (or the server's). Never throws: returns { error } instead.
 */
export const stripeReady = (creds) => Boolean(creds?.stripe?.secretKey);

async function stripe(secretKey, path, { method = 'GET', form } = {}) {
  try {
    const res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: { authorization: `Bearer ${secretKey}`, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? form.toString() : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error?.message || `Stripe responded ${res.status}` };
    return { data };
  } catch (err) {
    return { error: `Stripe unreachable: ${err.message}` };
  }
}

/** Creates a hosted Stripe Checkout page for the amount still owed. Returns { url, id } or { error }. */
export async function createCheckoutSession({ secretKey, doc, orgName, amountPence, returnUrl }) {
  const join = returnUrl.includes('?') ? '&' : '?';
  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'gbp',
    'line_items[0][price_data][product_data][name]': `${orgName} – ${doc.purpose === 'deposit' ? 'deposit' : doc.kind} ${doc.number}`,
    'line_items[0][price_data][unit_amount]': String(amountPence),
    'line_items[0][quantity]': '1',
    // Stripe fills in {CHECKOUT_SESSION_ID}; the page then confirms the payment straight away.
    success_url: `${returnUrl}${join}paid=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: returnUrl,
    client_reference_id: doc.id,
    'metadata[invoice_id]': doc.id,
    'metadata[org_id]': doc.org_id,
    'payment_intent_data[metadata][invoice_id]': doc.id,
    'payment_intent_data[metadata][org_id]': doc.org_id,
  });
  if (doc.contact_email) form.set('customer_email', doc.contact_email);
  const r = await stripe(secretKey, 'checkout/sessions', { method: 'POST', form });
  return r.error ? { error: r.error } : { url: r.data.url, id: r.data.id };
}

/** Looks up a Checkout session (to confirm a payment without waiting for the webhook). */
export async function retrieveCheckoutSession(secretKey, sessionId) {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(String(sessionId))) return { error: 'Not a Stripe checkout session' };
  return stripe(secretKey, `checkout/sessions/${sessionId}`);
}
