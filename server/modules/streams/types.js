/**
 * The kinds of income stream someone can add to the API hub. Each one knows
 * its own categories, the figures worth tracking (followers, account balance…)
 * and the ways its data can come in, so a TikTok stream, a trading account and
 * a digital-products shop each look and work the way that income really does.
 */

// How data can reach a stream. Every stream has its own web address and can use the API.
export const SOURCES = {
  manual: 'Typed in by you',
  import: 'Spreadsheet (CSV) import',
  webhook: 'Its own web address (Zapier, Make, Stripe, Shopify, Gumroad…)',
  api: 'The API, with a key',
};

export const STREAM_TYPES = {
  tiktok: {
    label: 'TikTok',
    icon: '🎵',
    blurb: 'Creator Rewards, LIVE gifts, brand deals, TikTok Shop and affiliate commission.',
    income: ['Creator Rewards', 'LIVE gifts', 'Brand deal', 'TikTok Shop commission', 'Affiliate commission', 'Subscriptions', 'Other'],
    expenses: ['Equipment', 'Editing apps & software', 'Promote / ads', 'Manager or agency fee', 'Props & products', 'Other'],
    metrics: [
      { key: 'followers', label: 'Followers' },
      { key: 'views_30d', label: 'Views (last 30 days)' },
      { key: 'engagement_rate', label: 'Engagement rate', unit: '%' },
    ],
    defaultName: 'TikTok',
    handleLabel: 'TikTok handle',
    connect: [
      'TikTok doesn’t send creator earnings to other apps, so add each payout as it lands (Add money in), or import the CSV from TikTok Studio → Rewards.',
      'Brand deals invoiced through Quotes & invoices can be added here when they’re paid.',
      'TikTok Shop or affiliate sales can be sent automatically: point a Zapier or Make step at this stream’s web address.',
      'Update followers and views once a week (Update figures) to see your growth next to your earnings.',
    ],
  },
  trading: {
    label: 'Trading',
    icon: '📈',
    blurb: 'Closed trades, dividends, fees, and money moved in and out of the account – kept apart from profit.',
    income: ['Closed trade', 'Dividends', 'Interest', 'Other'],
    expenses: ['Closed trade', 'Fees & commission', 'Overnight / funding charges', 'Platform & data subscriptions', 'Courses & tools', 'Other'],
    transfers: ['Deposit', 'Withdrawal'],
    metrics: [
      { key: 'balance', label: 'Account balance', money: true },
      { key: 'open_positions', label: 'Open positions' },
    ],
    defaultName: 'Trading',
    handleLabel: 'Broker / account',
    incomeLabel: 'Profit',
    expenseLabel: 'Loss or cost',
    connect: [
      'Import your broker’s statement or trade history (CSV). Closed trades with a profit/loss (“Result”, “P/L”, “Realised”) are recorded as wins and losses, and deposits and withdrawals are kept apart from profit.',
      'Importing the same file twice won’t double anything up.',
      'Trading bots, TradingView alerts or a spreadsheet can send each closed trade to this stream’s web address or the API – a negative amount is a loss.',
      'Update the account balance (Update figures) to track it over time.',
    ],
  },
  digital_products: {
    label: 'Digital products',
    icon: '💾',
    blurb: 'Courses, e-books, templates, presets and memberships – sales, refunds and fees.',
    income: ['Sale', 'Subscription / membership', 'Other'],
    expenses: ['Refund', 'Platform & payment fees', 'Ads', 'Software & hosting', 'Design & freelancers', 'Other'],
    metrics: [
      { key: 'customers', label: 'Customers' },
      { key: 'email_subscribers', label: 'Email subscribers' },
    ],
    defaultName: 'Digital products',
    handleLabel: 'Shop / platform',
    connect: [
      'Stripe: in Stripe → Developers → Webhooks, add this stream’s web address and choose the “charge.succeeded” and “charge.refunded” events. Every sale and refund then appears here by itself.',
      'Shopify: Settings → Notifications → Webhooks → “Order payment” and “Refund create”, in JSON, to this stream’s web address.',
      'Gumroad: Settings → Advanced → Ping, and paste this stream’s web address.',
      'Anything else (Payhip, Etsy, Lemon Squeezy, Teachable…): use a Zapier or Make step that sends each sale to the web address, or import a CSV.',
    ],
  },
  youtube: {
    label: 'YouTube',
    icon: '▶️',
    blurb: 'AdSense, memberships, Super Thanks and sponsorships.',
    income: ['AdSense', 'Memberships', 'Super Chat & Super Thanks', 'Sponsorship', 'Other'],
    expenses: ['Equipment', 'Editing & thumbnails', 'Software', 'Other'],
    metrics: [{ key: 'subscribers', label: 'Subscribers' }, { key: 'views_30d', label: 'Views (last 30 days)' }],
    defaultName: 'YouTube',
    handleLabel: 'Channel',
    connect: ['Add each AdSense payment as it lands, or import the CSV from YouTube Studio → Analytics → Revenue.', 'Sponsorships can come from paid invoices or be sent to the web address.'],
  },
  affiliate: {
    label: 'Affiliate marketing',
    icon: '🔗',
    blurb: 'Commission from Amazon Associates, networks and partner programmes.',
    income: ['Commission', 'Bonus', 'Other'],
    expenses: ['Ads', 'Website & hosting', 'Tools', 'Other'],
    metrics: [{ key: 'clicks_30d', label: 'Clicks (last 30 days)' }, { key: 'conversion_rate', label: 'Conversion rate', unit: '%' }],
    defaultName: 'Affiliate',
    handleLabel: 'Networks',
    connect: ['Import each network’s commission report (CSV), or send approved commissions to the web address with Zapier or Make.'],
  },
  ecommerce: {
    label: 'Online shop',
    icon: '🛒',
    blurb: 'Physical products sold online – orders, refunds, stock and shipping costs.',
    income: ['Order', 'Other'],
    expenses: ['Refund', 'Stock', 'Shipping & packaging', 'Platform & payment fees', 'Ads', 'Other'],
    metrics: [{ key: 'orders_30d', label: 'Orders (last 30 days)' }],
    defaultName: 'Online shop',
    handleLabel: 'Shop',
    connect: ['Shopify, Stripe and Gumroad can send orders and refunds straight to this stream’s web address (see Digital products for the steps).', 'Etsy, eBay and Amazon: import the sales CSV.'],
  },
  client_work: {
    label: 'Client work / freelancing',
    icon: '💼',
    blurb: 'Consulting, freelance and service income outside the main business.',
    income: ['Client payment', 'Retainer', 'Other'],
    expenses: ['Software', 'Subcontractors', 'Travel', 'Other'],
    metrics: [{ key: 'active_clients', label: 'Active clients' }],
    defaultName: 'Client work',
    handleLabel: 'Trading as',
    connect: ['Add payments as they arrive, import a bank CSV, or send them from your invoicing app to the web address.'],
  },
  property: {
    label: 'Rental property',
    icon: '🏠',
    blurb: 'Rent, deposits and the costs of letting a property.',
    income: ['Rent', 'Other'],
    expenses: ['Mortgage interest', 'Repairs & maintenance', 'Letting agent fees', 'Insurance', 'Bills & council tax', 'Other'],
    transfers: ['Tenant deposit in', 'Tenant deposit returned'],
    metrics: [{ key: 'occupancy', label: 'Occupancy', unit: '%' }],
    defaultName: 'Rental property',
    handleLabel: 'Address',
    connect: ['Add rent when it lands or import your bank or letting-agent statement (CSV).'],
  },
  other: {
    label: 'Something else',
    icon: '➕',
    blurb: 'Any other income – a side business, licensing, royalties, crypto, reselling…',
    income: ['Income', 'Other'],
    expenses: ['Costs', 'Other'],
    metrics: [],
    defaultName: 'Other income',
    handleLabel: 'Details',
    connect: ['Add money in and out by hand, import a CSV, or send it to the web address or API from any app.'],
  },
};

export const typeOf = (type) => STREAM_TYPES[type] || STREAM_TYPES.other;

/** A stream type as the front end needs it. */
export function describeType(key) {
  const t = typeOf(key);
  return {
    key, label: t.label, icon: t.icon, blurb: t.blurb, income: t.income, expenses: t.expenses, transfers: t.transfers || ['Money in', 'Money out'],
    metrics: t.metrics, default_name: t.defaultName, handle_label: t.handleLabel, connect: t.connect,
    income_label: t.incomeLabel || 'Money in', expense_label: t.expenseLabel || 'Money out',
  };
}
