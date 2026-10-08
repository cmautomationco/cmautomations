/**
 * Default wording for every message the system sends. Each business can edit
 * any of these in Settings → Messages; edits are stored per business.
 * {{placeholders}} are filled in when sending; unknown ones are left blank.
 *
 * audience: 'customer' messages respect opt-outs and quiet hours;
 *           'staff' messages go to the team (alerts, job sheets).
 */
export const TEMPLATES = {
  // ── Calls & enquiries ──
  missed_call: {
    group: 'Calls & enquiries', label: 'Missed call text-back', audience: 'customer',
    body: 'Hi{{first_name_spaced}}, sorry we missed your call – we’re probably on a job. Reply here with what you need and your postcode and we’ll get back to you, or book a slot: {{booking_link}} – {{business}}',
  },
  new_lead_welcome: {
    group: 'Calls & enquiries', label: 'Welcome a new enquiry', audience: 'customer',
    subject: 'Thanks for getting in touch with {{business}}',
    body: 'Hi{{first_name_spaced}},\n\nThanks for getting in touch. We’ve got your enquiry and someone will be in touch within one working day.\n\nIf it’s easier, you can book a time that suits you here: {{booking_link}}\n\n{{business}}',
  },
  form_thank_you: {
    group: 'Calls & enquiries', label: 'Form received', audience: 'customer',
    subject: 'We’ve received your message',
    body: 'Hi{{first_name_spaced}}, thanks for your message – we’ll reply within one working day. {{business}}',
  },
  opt_out_confirm: {
    group: 'Calls & enquiries', label: 'Unsubscribed (reply to STOP)', audience: 'system',
    body: 'You won’t receive any more texts from {{business}}. Reply START to opt back in.',
  },
  opt_in_confirm: {
    group: 'Calls & enquiries', label: 'Subscribed again (reply to START)', audience: 'system',
    body: 'Thanks – you’ll receive updates from {{business}} again. Reply STOP at any time to opt out.',
  },

  // ── Bookings ──
  booking_confirmation: {
    group: 'Bookings', label: 'Booking confirmed', audience: 'customer',
    subject: 'Your booking with {{business}} – {{date}} at {{time}}',
    body: 'Hi{{first_name_spaced}}, your {{service}} is booked for {{date}} at {{time}}{{address_line}}. Reply C to confirm or R if you need to change it. – {{business}}',
  },
  booking_request_received: {
    group: 'Bookings', label: 'Booking request received', audience: 'customer',
    subject: 'We’ve got your booking request',
    body: 'Hi{{first_name_spaced}}, thanks – we’ve got your request for {{service}} on {{date}} at {{time}}. We’ll confirm shortly. – {{business}}',
  },
  booking_reminder_24h: {
    group: 'Bookings', label: 'Reminder the day before', audience: 'customer',
    subject: 'Reminder: {{service}} tomorrow at {{time}}',
    body: 'Hi{{first_name_spaced}}, a reminder that we’re booked for {{service}} tomorrow ({{date}}) at {{time}}{{address_line}}. Reply C to confirm or R to rearrange. – {{business}}',
  },
  booking_reminder_2h: {
    group: 'Bookings', label: 'Reminder 2 hours before', audience: 'customer',
    body: 'Hi{{first_name_spaced}}, see you at {{time}} today for {{service}}. – {{business}}',
  },
  booking_on_my_way: {
    group: 'Bookings', label: 'On my way', audience: 'customer',
    body: 'Hi{{first_name_spaced}}, {{staff}} from {{business}} is on the way and should be with you around {{eta}}.',
  },
  booking_confirmed_by_customer: {
    group: 'Bookings', label: 'Thanks for confirming (reply to C)', audience: 'system',
    body: 'Thanks{{first_name_spaced}} – you’re all confirmed for {{date}} at {{time}}. – {{business}}',
  },
  booking_reschedule: {
    group: 'Bookings', label: 'Change requested (reply to R)', audience: 'system',
    body: 'No problem{{first_name_spaced}} – pick a new time here: {{booking_link}}, or reply with a day and time that suits and we’ll sort it. – {{business}}',
  },
  booking_moved: {
    group: 'Bookings', label: 'Booking moved', audience: 'customer',
    subject: 'Your booking has moved to {{date}} at {{time}}',
    body: 'Hi{{first_name_spaced}}, your {{service}} has moved to {{date}} at {{time}}{{address_line}}. Reply C to confirm or R if that doesn’t work. – {{business}}',
  },
  booking_cancelled: {
    group: 'Bookings', label: 'Booking cancelled', audience: 'customer',
    subject: 'Your booking has been cancelled',
    body: 'Hi{{first_name_spaced}}, your {{service}} on {{date}} at {{time}} has been cancelled. Rebook any time: {{booking_link}} – {{business}}',
  },
  booking_no_show: {
    group: 'Bookings', label: 'Sorry we missed you (no-show)', audience: 'customer',
    subject: 'Sorry we missed you',
    body: 'Hi{{first_name_spaced}}, we came for your {{service}} at {{time}} but couldn’t reach you. Rebook a time that suits here: {{booking_link}} – {{business}}',
  },
  booking_review_request: {
    group: 'Bookings', label: 'Review request after the job', audience: 'customer',
    subject: 'How did we do?',
    body: 'Thanks for choosing {{business}}{{first_name_comma}}! If you were happy, a quick review really helps us: {{review_link}}',
  },
  deposit_request: {
    group: 'Bookings', label: 'Deposit request', audience: 'customer',
    subject: 'Deposit for your booking on {{date}}',
    body: 'Hi{{first_name_spaced}}, to secure your {{service}} on {{date}} at {{time}}, please pay the {{amount}} deposit here: {{doc_link}} – {{business}}',
  },

  // ── Quotes & invoices ──
  quote_sent: {
    group: 'Quotes & invoices', label: 'Quote sent', audience: 'customer',
    subject: 'Your quote from {{business}} ({{number}})',
    body: 'Hi{{first_name_spaced}}, here’s your quote {{number}} for {{amount}}: {{doc_link}} – you can accept it online. Any questions, just reply. {{business}}',
  },
  invoice_sent: {
    group: 'Quotes & invoices', label: 'Invoice sent', audience: 'customer',
    subject: 'Invoice {{number}} from {{business}}',
    body: 'Hi{{first_name_spaced}}, here’s invoice {{number}} for {{amount}}, due {{due_date}}. View and pay here: {{doc_link}} Thank you! {{business}}',
  },
  invoice_reminder_1: {
    group: 'Quotes & invoices', label: 'Payment reminder (friendly)', audience: 'customer',
    subject: 'Friendly reminder: invoice {{number}}',
    body: 'Hi{{first_name_spaced}}, just a friendly reminder that invoice {{number}} for {{amount}} was due on {{due_date}}. You can pay here: {{doc_link}} If you’ve already paid, thank you and please ignore this. {{business}}',
  },
  invoice_reminder_2: {
    group: 'Quotes & invoices', label: 'Payment reminder (firmer)', audience: 'customer',
    subject: 'Overdue: invoice {{number}}',
    body: 'Hi{{first_name_spaced}}, invoice {{number}} for {{amount}} is now {{days_overdue}} days overdue. Please pay today here: {{doc_link}} or reply if there’s a problem we can help with. {{business}}',
  },
  invoice_paid_thanks: {
    group: 'Quotes & invoices', label: 'Payment received', audience: 'customer',
    subject: 'Payment received – thank you',
    body: 'Hi{{first_name_spaced}}, we’ve received your payment of {{amount}} for invoice {{number}}. Thank you! {{business}}',
  },

  // ── Agency ──
  proposal_sent: {
    group: 'Agency', label: 'Proposal sent', audience: 'customer',
    subject: 'Your automation proposal from {{business}}',
    body: 'Hi{{first_name_spaced}},\n\nThanks for your time. Here’s your proposal, based on what we found in your audit: {{doc_link}}\n\nYou can accept it online when you’re ready.\n\n{{business}}',
  },
  report_ready: {
    group: 'Agency', label: 'Monthly report ready', audience: 'customer',
    subject: 'Your {{month}} report: {{hours}} hours saved',
    body: 'Hi{{first_name_spaced}},\n\nYour monthly report for {{month}} is ready. The headline: your system saved about {{hours}} hours.\n\nRead it here: {{doc_link}}\n\n{{business}}',
  },

  // ── Team alerts ──
  staff_new_message: {
    group: 'Team alerts', label: 'New message alert', audience: 'staff',
    body: '{{urgent_prefix}}New {{channel}} from {{name}} ({{phone}}): “{{message}}”',
  },
  staff_missed_call: {
    group: 'Team alerts', label: 'Missed call alert', audience: 'staff',
    body: '📞 Missed call from {{name}} ({{phone}}).{{texted_line}} Call back when you can.',
  },
  staff_new_booking: {
    group: 'Team alerts', label: 'New booking alert', audience: 'staff',
    body: 'New booking: {{service}} for {{name}} on {{date}} at {{time}}{{address_line}}.{{urgent_line}}',
  },
  staff_booking_update: {
    group: 'Team alerts', label: 'Customer replied about a booking', audience: 'staff',
    body: '{{name}} {{update}} for {{service}} on {{date}} at {{time}}.',
  },
  staff_overdue_invoice: {
    group: 'Team alerts', label: 'Unpaid invoice needs a call', audience: 'staff',
    body: '💷 {{number}} for {{name}} – {{amount}} is {{days_overdue}} days overdue. Two reminders have gone out. Please give them a call.',
  },
  staff_custom: {
    group: 'Team alerts', label: 'Alert from an automation', audience: 'staff',
    body: '{{message}}',
  },
  staff_job_sheet: {
    group: 'Team alerts', label: 'Morning job sheet', audience: 'staff',
    body: 'Morning! Today’s jobs ({{count}}):\n{{jobs}}',
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES);
