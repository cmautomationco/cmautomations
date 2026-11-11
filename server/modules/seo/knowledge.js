/**
 * SEO knowledge: the guide, the checklist, what each kind of business gets
 * from SEO, and the packages an agency can offer. Written for business owners
 * – plain words, what to do, and what to expect – not for SEO specialists.
 *
 * Kept to what's true and lasting: how Google says it ranks results, the
 * jobs that move the needle, and honest timelines. No invented statistics.
 */

// ───────────────────────── The basics ─────────────────────────

export const BASICS = {
  what: [
    'SEO (search engine optimisation) is everything you do so that people find your business on Google – and Bing, Apple Maps and AI assistants – when they search for what you sell, without you paying for each click.',
    'A Google results page has three main parts: paid ads at the top (marked “Sponsored”), the map with three businesses (the “local pack”) for anything local, and the ordinary “organic” results below. SEO is how you earn a place in the map and the organic results.',
    'Google also shows AI Overviews – a written answer above the results – for many questions. They draw on pages Google already trusts, so the same work (clear, helpful pages and a strong business profile) is how you appear there too.',
  ],
  gets: [
    { title: 'Customers who are already looking', text: 'Someone typing “emergency plumber Bristol” or “lash lift near me” wants to buy now. SEO puts you in front of people at the exact moment they need you – unlike social posts, which interrupt people who weren’t looking.' },
    { title: 'Leads that keep coming without paying per click', text: 'Ads stop the day you stop paying. A page that ranks keeps bringing enquiries month after month, so the cost of each lead falls over time.' },
    { title: 'Trust before the first call', text: 'A complete Google Business Profile with recent reviews, photos and replies makes people choose you over the business next to you – often before they’ve visited your website.' },
    { title: 'More calls, bookings and direction requests', text: 'Most local searches end in a call, a booking or a visit, not a website visit. A strong profile with a booking link and phone number turns searches straight into jobs.' },
    { title: 'An asset you own', text: 'Your website, its pages and your reviews build up value. Unlike a social account or an ad campaign, they keep working and are part of what the business is worth.' },
    { title: 'Insight into what customers want', text: 'Search Console shows the exact words people use to find you. That tells you which services are in demand, which areas to target and what questions to answer in your content.' },
  ],
  doesnt: [
    'It isn’t instant. Most businesses see the first movement in 2–3 months and real results in 4–12 months, depending on how competitive their area and services are.',
    'Nobody can guarantee a #1 position. Anyone who promises that is guessing – or doing something risky that can get a site penalised.',
    'It can’t fix a weak offer. If the price, reviews or website don’t convince people, ranking higher just shows more people a reason to go elsewhere.',
    'It isn’t a one-off job. Competitors keep working, Google keeps updating, and reviews and content need to stay fresh. Think of it like keeping a shop window tidy.',
  ],
  needIt: [
    'Customers search for what you sell (“plumber near me”, “wedding hair Bath”, “business coach for women”). If they do, you need to be found there.',
    'You rely on word of mouth or one social platform and want a steadier flow of enquiries.',
    'Competitors appear on Google and you don’t – or they have more reviews than you.',
    'You spend on ads and want to bring the cost per lead down over time.',
    'You serve a local area: the map results are often the single biggest source of calls for local businesses.',
    'You’re about to launch a new service or open in a new area and want people to find it.',
  ],
  howGoogleDecides: [
    { title: 'Relevance', text: 'Does the page or profile match what was searched? Clear service pages, the right Google Business Profile categories and the words customers actually use.' },
    { title: 'Distance (local searches)', text: 'How close the business is to the person searching, or to the place they named. You can’t change where you are – but service-area settings and location pages make clear where you work.' },
    { title: 'Prominence and trust', text: 'How well known and trusted the business is: reviews (how many, how recent, how good), links and mentions from other websites, and consistent details across the web.' },
    { title: 'Helpfulness and experience', text: 'Google rewards content written by people who know the subject and genuinely help the reader – real photos, real prices, real answers. Google calls this E-E-A-T: experience, expertise, authoritativeness and trust.' },
    { title: 'A website that works', text: 'Pages Google can read, that load quickly, work well on a phone and are secure (https). This doesn’t make you rank on its own, but problems here hold everything else back.' },
  ],
};

// ───────────────────────── The pillars, in detail ─────────────────────────

export const PILLARS = [
  {
    key: 'gbp', title: 'Google Business Profile', short: 'Your free listing in Google Maps and the local pack',
    why: 'For local businesses this is usually the most valuable SEO job there is. It’s what appears in the map results, and many customers call or book straight from it without visiting your website.',
    do: [
      'Claim and verify the profile at business.google.com. Use the exact business name you trade under – no extra keywords, which breaks Google’s rules and can get the profile suspended.',
      'Choose the most accurate primary category (e.g. “Plumber”, “Beauty salon”, “Life coach”) – it matters more than anything else on the profile. Add secondary categories only for things you really do.',
      'Fill in everything: services (with descriptions and prices if you can), service areas or address, opening hours (including holiday hours), phone number, website and your booking link as the appointment link.',
      'Add real photos regularly: your team, your van or premises, your work (before and after), your products. Real photos build trust; stock photos don’t.',
      'Post updates – offers, recent jobs, events, tips – a couple of times a month. It shows customers (and Google) the business is active.',
      'Ask every happy customer for a review, and reply to every review – thank the good ones, and answer the bad ones calmly with how you put it right.',
      'Use the same business name, address and phone number everywhere online (your “NAP”).',
    ],
    mistakes: ['Keywords stuffed into the business name', 'A virtual office or PO box as the address (not allowed)', 'Wrong or missing opening hours', 'Ignoring reviews, especially negative ones', 'Leaving the booking/appointment link empty'],
    measure: 'Profile performance in Google Business Profile: searches, views, calls, website clicks, booking clicks and direction requests.',
  },
  {
    key: 'reviews', title: 'Reviews & reputation', short: 'How many, how recent, how good – and how you reply',
    why: 'Reviews are one of the strongest signals for local ranking, and the first thing customers compare. A business with a steady flow of recent reviews looks alive and trustworthy.',
    do: [
      'Ask every customer straight after a good job, with a one-tap link. Asking in person and following up with a message works best (Essentials → Review request does the message for you).',
      'Aim for a steady flow (a few every month) rather than a burst once a year – recency matters.',
      'Reply to every review within a few days, mentioning the service and area naturally (“Thanks Sarah – glad the boiler service in Clifton went smoothly”).',
      'Never offer rewards for reviews, write your own or ask only happy customers through a filter – it’s against Google’s rules and can get reviews removed.',
      'Collect reviews on the sites your customers check too: Checkatrade/TrustATrader for trades, Treatwell/Fresha for beauty, Tripadvisor for hospitality, Trustpilot for online shops.',
    ],
    mistakes: ['Asking weeks later when the moment has passed', 'Not replying to negative reviews', 'Review “gating” (only sending happy customers to Google)', 'Copy-and-paste replies'],
    measure: 'Number of Google reviews, average rating, reviews this month, and how many review requests turn into reviews.',
  },
  {
    key: 'onpage', title: 'Your website & pages', short: 'Clear pages for each service and area, written for customers',
    why: 'Google ranks pages, not businesses. A page that clearly matches a search (“boiler service in Bristol”) beats a homepage that lists twenty things in one paragraph.',
    do: [
      'Give each main service its own page: what it is, who it’s for, price or price guide, how it works, photos, reviews, FAQs and a clear “Book” or “Call” button.',
      'If you cover several towns, create genuine location pages (real jobs, photos and reviews from that area) – not copy-pasted pages with the town name swapped.',
      'Write a unique title for every page (about 50–60 characters) with the service and place first: “Boiler Service Bristol | Swift Plumbing & Heating”.',
      'Write a meta description (about 150–160 characters) that sells the click: price guide, speed, reviews. It doesn’t change rankings but changes how many people click.',
      'Use one clear heading (H1) per page saying what it’s about, and sub-headings for each section.',
      'Link your pages to each other: services link to related services, blog posts link to the service they’re about.',
      'Put your business name, address/area and phone number in the footer of every page, matching your Google profile.',
      'Make it easy to act: phone number tap-to-call on mobile, booking link, WhatsApp button, short forms.',
    ],
    mistakes: ['One page trying to rank for everything', 'Copied location pages', 'Pages with no price, photo or proof', 'Images with no description (alt text)', 'Hiding the phone number'],
    measure: 'Search Console: impressions and clicks per page; enquiries and bookings from the website.',
  },
  {
    key: 'technical', title: 'Technical health', short: 'A fast, secure website Google can read on a phone',
    why: 'Technical problems don’t make you rank, but they can stop good pages ranking at all. Google looks at the mobile version of your site first, and slow pages lose customers before they load.',
    do: [
      'Make sure the whole site uses https (the padlock).',
      'Check every page works properly on a phone: readable text, buttons big enough to tap, nothing wider than the screen.',
      'Check speed in Google PageSpeed Insights. Google’s “Core Web Vitals” targets: the main content loads in under 2.5 seconds (LCP), the page reacts to taps within 0.2 seconds (INP), and nothing jumps around while loading (CLS under 0.1).',
      'Compress images and use modern formats (WebP); avoid huge sliders and auto-playing videos at the top of pages.',
      'Set up Google Search Console, submit your sitemap, and fix anything it reports under Pages and Core Web Vitals.',
      'Add structured data (schema) for your business – LocalBusiness or a more specific type such as Plumber, Electrician, HairSalon, BeautySalon, Restaurant or RealEstateAgent – with your name, address, phone, hours and area.',
      'Fix broken links and redirect old page addresses to their new ones (301 redirects) when you change your site.',
    ],
    mistakes: ['Blocking Google by accident (a “noindex” left on after a redesign)', 'Huge unoptimised images', 'Several versions of the site (http/https, www/non-www) all live', 'Changing website without redirecting old pages'],
    measure: 'Search Console: pages indexed, Core Web Vitals report, and any errors; PageSpeed Insights scores on mobile.',
  },
  {
    key: 'content', title: 'Helpful content', short: 'Answer the questions customers ask before they buy',
    why: 'People search long before they buy: “how much does a new boiler cost”, “is a lash lift bad for your lashes”, “how to choose a business coach”. Helpful answers bring them to you first, build trust, and give Google (and AI answers) a reason to quote you.',
    do: [
      'List the questions customers ask you every week – each is a page or post waiting to be written.',
      'Write from experience: real examples, real prices or price ranges, photos of your own work, what you’d tell a friend. This is what Google means by experience and expertise.',
      'Answer the question in the first couple of sentences, then go into detail.',
      'Group content around your main services (a “topic cluster”): a main service page, with posts answering related questions all linking back to it.',
      'Update older posts every year – prices, photos, new tips – rather than only writing new ones.',
      'Reuse what you already create: turn a popular reel or video into a post, add the video to the page (Content Studio ideas work well here).',
      'Put your name and experience on articles (an author box) so readers – and Google – know who’s advising them.',
    ],
    mistakes: ['Generic posts anyone could write', 'Mass-produced AI text with no real experience in it', 'Writing about things customers never search for', 'Posting once and never updating'],
    measure: 'Search Console: which queries and pages bring clicks; enquiries that mention a blog post; time on page.',
  },
  {
    key: 'links', title: 'Links, citations & mentions', short: 'Other trusted websites pointing to you',
    why: 'Links and mentions from other websites act like recommendations. For local businesses, consistent listings in directories (citations) also confirm your details are real.',
    do: [
      'List the business on the main directories with identical details: Bing Places, Apple Business Connect, Yell, Facebook, and the ones in your industry (e.g. Checkatrade, TrustATrader, MyBuilder; Treatwell, Fresha; Tripadvisor, OpenTable; Rightmove, Zoopla).',
      'Get mentioned locally: suppliers you use, local business groups, chambers of commerce, sponsorship of a local team or event, charity work.',
      'Work with businesses next to yours: a kitchen fitter and an electrician, a salon and a wedding venue, a coach and an accountant – feature each other.',
      'Share genuinely useful things: a local guide, a price survey, a free tool or checklist – people link to useful resources.',
      'Pitch your expertise to local news and industry sites (“5 signs your boiler needs replacing before winter”).',
    ],
    mistakes: ['Buying links or link packages – against Google’s rules and can sink a site', 'Different phone numbers or addresses on different listings', 'Hundreds of low-quality directories', 'Swapping links with unrelated sites'],
    measure: 'Number of websites linking to you (Search Console → Links); consistent citations checked once a quarter.',
  },
  {
    key: 'measure', title: 'Measuring what works', short: 'Know which searches turn into customers',
    why: 'Rankings are only useful if they turn into calls, bookings and sales. Measuring the whole path – search → visit → enquiry → paying customer – shows where to spend time.',
    do: [
      'Set up Google Search Console (free): impressions, clicks, average position and the search terms that find you.',
      'Set up Google Analytics 4 (free) and mark enquiries, bookings and calls as key events (conversions).',
      'Check Google Business Profile performance each month: calls, website clicks, booking clicks, direction requests.',
      'Tag every new lead with where it came from – Essentials → Lead source tagging does this here – so you can see how many paying customers came from Google.',
      'Ask new customers “how did you find us?” and record it.',
      'Look at the numbers monthly, not daily – SEO moves over weeks and months.',
    ],
    mistakes: ['Only watching rankings', 'Not knowing which enquiries came from Google', 'Judging SEO after a few weeks'],
    measure: 'Monthly: Google clicks, GBP calls/bookings, leads tagged Google, and how many of those became customers.',
  },
];

export const TIMELINE = [
  { when: 'Month 1', title: 'Foundations', items: ['Google Business Profile complete and verified', 'Search Console and Analytics set up', 'Fix technical problems (https, mobile, speed, indexing)', 'Main service pages written or improved', 'Review requests switched on'] },
  { when: 'Months 2–3', title: 'Build trust', items: ['Directory listings (citations) consistent', 'Steady reviews, every one replied to', 'First helpful posts answering top customer questions', 'Location pages for the main areas you cover'], expect: 'Usually the first movement: more impressions, some new search terms, more profile views.' },
  { when: 'Months 4–6', title: 'Grow', items: ['More content around each service', 'Local links and partnerships', 'Improve pages that get seen but not clicked (titles and descriptions)'], expect: 'For most local businesses: more calls and bookings from the profile, some pages on page one for less competitive searches.' },
  { when: 'Months 6–12', title: 'Compound', items: ['Refresh and expand what works', 'Target more competitive searches and new areas', 'Keep reviews and posts flowing'], expect: 'Steady leads from Google that cost less each month; competitive terms take longer.' },
];

export const CHANNELS = [
  { name: 'SEO', speed: 'Slow to start (months)', cost: 'Time or a monthly fee; no cost per click', lasts: 'Keeps working and builds up', best: 'Steady, lower-cost leads from people already searching' },
  { name: 'Google Ads', speed: 'Instant', cost: 'Pay for every click', lasts: 'Stops when you stop paying', best: 'Filling the diary now, testing which services sell, competitive searches' },
  { name: 'Social media', speed: 'Quick reach, slow to build', cost: 'Time (or ads)', lasts: 'Posts fade within days', best: 'Showing your work and personality, staying front of mind, people who aren’t searching yet' },
];

export const GLOSSARY = [
  ['Local pack / map pack', 'The map and three businesses Google shows for local searches.'],
  ['Organic results', 'The ordinary (unpaid) results under the ads and map.'],
  ['Keyword / search term', 'The words someone types or says to search.'],
  ['Search intent', 'What the person wants: to buy now, compare, or learn.'],
  ['Impressions', 'How many times your site appeared in results.'],
  ['CTR (click-through rate)', 'Clicks ÷ impressions – how often people chose you.'],
  ['Average position', 'Where you usually appear for a search (1 = top).'],
  ['Title tag', 'The blue clickable headline of your page in the results.'],
  ['Meta description', 'The short text under the title in the results.'],
  ['Backlink', 'A link from another website to yours.'],
  ['Citation', 'A listing of your name, address and phone on another site.'],
  ['NAP', 'Name, address, phone – keep them identical everywhere.'],
  ['Schema / structured data', 'Code that tells Google facts about your business or page.'],
  ['Core Web Vitals', 'Google’s measures of loading speed, responsiveness and stability.'],
  ['Indexing', 'Google storing your page so it can show it in results.'],
  ['E-E-A-T', 'Experience, expertise, authoritativeness, trust – what Google looks for in helpful content.'],
  ['AI Overview', 'The AI-written summary Google shows above some results.'],
];

// ───────────────────────── What each kind of business gets ─────────────────────────

export const NICHE_GUIDES = {
  local_services: {
    provider: 'tradesperson', providerShort: 'plumber', local: true,
    services: ['boiler service', 'emergency plumber', 'bathroom installation', 'leak repair'],
    searches: 'Mostly urgent and local: “emergency plumber near me”, “electrician Bristol”, “boiler repair same day”. People ring the first two or three businesses in the map that look trustworthy.',
    gets: ['More calls and WhatsApps straight from the Google map results, including emergency call-outs', 'Fewer leads bought from lead sites like Checkatrade or MyBuilder', 'Higher-value jobs (installations, bathrooms) from people researching prices', 'A full diary in the quieter months'],
    priorities: ['gbp', 'reviews', 'onpage', 'links', 'technical', 'content', 'measure'],
    quickWins: ['Pick the exact primary category (Plumber, Electrician, Heating contractor…) and set your service areas', 'Add your booking link and WhatsApp to the profile', 'Switch on review requests after every job and reply to every review', 'Create one page per main service, with prices from', 'Add before-and-after photos every week'],
    content: ['How much does a new boiler cost in [area]?', 'What to do if a pipe bursts – before we arrive', 'Combi or system boiler: which is right for your home?', 'Signs your consumer unit needs replacing'],
    kpi: 'Calls and bookings from the Google profile; emergency call-outs; leads tagged Google.',
  },
  beauty: {
    provider: 'salon', providerShort: 'salon', local: true,
    services: ['lash extensions', 'brow lamination', 'gel nails', 'facial'],
    searches: 'Local and visual: “lash extensions near me”, “nail salon Clifton”, “brow lamination price”. People compare photos, reviews and prices, then book.',
    gets: ['New clients who book online straight from Google', 'Less reliance on Instagram reach', 'Clients searching for specific (higher-value) treatments', 'Bookings for quieter days and new therapists'],
    priorities: ['gbp', 'reviews', 'onpage', 'content', 'links', 'technical', 'measure'],
    quickWins: ['Upload real before-and-after photos to the Google profile every week', 'List every treatment as a service with a price', 'Add the online booking link to the profile', 'Ask for a review after every appointment', 'Make sure Treatwell/Fresha/booking listings use the same name, address and phone'],
    content: ['How long do lash extensions last (and how to make them last longer)?', 'Lash lift vs extensions: which is right for you?', 'What to expect at your first brow lamination', 'Bridal beauty timeline: when to book what'],
    kpi: 'Online bookings from Google, profile calls and direction requests, new clients per month.',
  },
  hospitality: {
    provider: 'restaurant', providerShort: 'restaurant', local: true,
    services: ['restaurant', 'private dining', 'sunday lunch', 'takeaway'],
    searches: 'Local and in-the-moment: “restaurants near me”, “Sunday lunch Bath”, “dog friendly pub Cotswolds”. Photos, menus, opening hours and reviews decide.',
    gets: ['More table bookings and walk-ins from people nearby', 'Bookings for events, private dining and functions', 'Visitors and tourists who don’t follow you on social media', 'Fewer bookings lost to out-of-date hours or menus'],
    priorities: ['gbp', 'reviews', 'onpage', 'links', 'technical', 'content', 'measure'],
    quickWins: ['Keep opening hours and holiday hours exactly right', 'Add the menu and booking link to the Google profile', 'Upload fresh food and interior photos weekly', 'Reply to every Google and Tripadvisor review', 'Mark attributes you have (outdoor seating, dog friendly, step-free access)'],
    content: ['Christmas party menus [year]', 'Our guide to [town] for a weekend visit', 'Private dining: how it works and what it costs', 'What’s in season on our menu this month'],
    kpi: 'Table bookings and calls from Google, direction requests, event enquiries.',
  },
  fitness: {
    provider: 'personal trainer', providerShort: 'gym', local: true,
    services: ['personal training', 'small group training', 'pilates classes', 'nutrition coaching'],
    searches: 'Local and goal-led: “personal trainer near me”, “pilates class Clifton”, “gym for beginners”. People look for results, reviews and a friendly feel.',
    gets: ['Enquiries from people ready to start', 'Free-trial and consultation bookings', 'Members for classes with spare spaces', 'Trust from transformation stories and reviews'],
    priorities: ['gbp', 'reviews', 'onpage', 'content', 'links', 'technical', 'measure'],
    quickWins: ['Add the free-trial / consultation booking link to the profile', 'Post class timetable updates and member wins', 'Create a page for each service with prices', 'Collect reviews mentioning results', 'Add real photos of the space and coaches'],
    content: ['How often should a beginner train?', 'Personal trainer vs gym membership: which is better value?', 'What to eat before a morning workout', 'Member story: how Sam lost 10kg in 12 weeks'],
    kpi: 'Trial bookings and enquiries from Google; new members per month.',
  },
  real_estate: {
    provider: 'estate agent', providerShort: 'estate agent', local: true,
    services: ['house valuation', 'estate agent', 'letting agent', 'property management'],
    searches: 'Local and high-value: “estate agents Bristol”, “free house valuation”, “letting agent fees”. Sellers and landlords compare reviews, fees and local knowledge.',
    gets: ['Valuation requests from sellers and landlords', 'Trust from local area guides and sold-price insight', 'Instructions without paying portals for every lead', 'Brand visibility in each area you cover'],
    priorities: ['gbp', 'reviews', 'content', 'onpage', 'links', 'technical', 'measure'],
    quickWins: ['Make the valuation request the main action on the profile and site', 'Create an area guide page for each neighbourhood you cover', 'Reply to every review with the area and service', 'Keep your listings on Rightmove/Zoopla consistent with Google'],
    content: ['[Area] house prices: what sold this quarter', 'How to sell your home faster in [town]', 'Landlord guide: rules and costs this year', 'Moving to [area]: schools, transport and streets'],
    kpi: 'Valuation requests and landlord enquiries from Google; instructions won.',
  },
  coaching: {
    provider: 'coach', providerShort: 'coach', local: false,
    services: ['career coaching', 'business coaching', 'confidence coaching', 'executive coaching'],
    searches: 'Problem-led and research-heavy: “career coach for women”, “how to change career at 40”, “business coach for small business”. People read, compare and book a call when they trust you.',
    gets: ['Discovery calls from people who have read your advice and already trust you', 'Clients beyond your local area', 'Less reliance on posting every day on social media', 'Authority that lets you charge more'],
    priorities: ['content', 'onpage', 'reviews', 'gbp', 'links', 'technical', 'measure'],
    quickWins: ['A clear page for each coaching offer with outcomes, process, price guide and testimonials', 'Write answers to the five questions clients ask on discovery calls', 'Add your booking link for a free call everywhere', 'Get a Google Business Profile if you see clients locally or online from a real base', 'Add an author bio showing your experience on every article'],
    content: ['How to know it’s time to change career', 'What actually happens in a coaching session?', 'Coach vs therapist vs mentor: which do you need?', 'How I helped a client go from stuck to promoted in 12 weeks'],
    kpi: 'Discovery calls booked from Google, newsletter sign-ups, clients citing an article.',
  },
  agency: {
    provider: 'agency', providerShort: 'marketing agency', local: false,
    services: ['website design', 'branding', 'social media management', 'video production'],
    searches: 'Research and comparison: “web design agency Bristol”, “branding agency for startups”, “how much does a website cost”.',
    gets: ['Inbound leads from businesses already looking for the service', 'Case studies that rank and sell at the same time', 'Better-fit clients who come to you, not tenders you chase', 'Proof of skill – an agency that ranks is its own advert'],
    priorities: ['content', 'onpage', 'links', 'reviews', 'gbp', 'technical', 'measure'],
    quickWins: ['A page per service with case studies and prices from', 'Turn every finished project into a case study page', 'Get listed in agency directories and partner pages', 'Collect Google reviews from clients'],
    content: ['How much does a website cost for a small business?', 'Case study: [client] – the problem, what we did, the results', 'What to ask before you hire an agency', 'Our process, step by step'],
    kpi: 'Enquiries and proposals from organic search; case study page visits.',
  },
  ecommerce: {
    provider: 'online shop', providerShort: 'online shop', local: false,
    services: ['handmade candles', 'gift sets', 'skincare', 'jewellery'],
    searches: 'Product and comparison searches: “soy candles gift set”, “vegan skincare UK”, “best gifts for her under £30”. Category and product pages compete with marketplaces.',
    gets: ['Sales from people searching for exactly what you sell', 'Less dependence on paid ads and marketplaces taking a cut', 'Gift-season traffic that comes back every year', 'Higher order values from guides and bundles'],
    priorities: ['onpage', 'technical', 'content', 'links', 'reviews', 'measure', 'gbp'],
    quickWins: ['Write unique product descriptions (not the supplier’s) with materials, sizes and use', 'Make category pages useful: an intro, filters and buying advice', 'Add product reviews and real photos', 'Fix duplicate pages from filters and variants', 'Create gift guides for the big seasons'],
    content: ['Gift guide: the best [product] for [occasion]', 'How to choose the right [product] for you', 'How our [product] is made', '[Product] care guide'],
    kpi: 'Organic revenue and orders; product and category page clicks.',
  },
  saas: {
    provider: 'software company', providerShort: 'software', local: false,
    services: ['booking software', 'invoicing software', 'CRM for small business', 'scheduling app'],
    searches: 'Problem, comparison and alternative searches: “best booking software for salons”, “[competitor] alternative”, “how to send invoices automatically”.',
    gets: ['Trial sign-ups from people actively comparing tools', 'Lower cost per customer than paid acquisition', 'Content that also helps sales and onboarding', 'Authority in your niche'],
    priorities: ['content', 'onpage', 'technical', 'links', 'measure', 'reviews', 'gbp'],
    quickWins: ['Create use-case pages (“for salons”, “for plumbers”)', 'Write honest comparison and alternative pages', 'Turn support answers into help articles', 'Get listed on software review sites'],
    content: ['[Competitor] vs [your tool]: an honest comparison', 'How to [job your tool does] in 5 steps', 'The best [category] tools for [audience]', 'Templates and free tools'],
    kpi: 'Trials and demos from organic search; sign-ups by landing page.',
  },
};
export const nicheGuide = (niche) => NICHE_GUIDES[niche] || NICHE_GUIDES.coaching;

// ───────────────────────── The checklist ─────────────────────────
// impact: 3 high · 2 medium · 1 low. local: only for businesses serving an area. detect: worked out from the system.

export const CHECKLIST = [
  // Google Business Profile
  { key: 'gbp_claim', pillar: 'gbp', local: true, impact: 3, effort: 'Quick', title: 'Claim and verify your Google Business Profile', how: 'Go to business.google.com, search for your business, claim it and complete verification – Google offers a method such as a short video, a phone call or a postcard.' },
  { key: 'gbp_category', pillar: 'gbp', local: true, impact: 3, effort: 'Quick', title: 'Choose the most accurate primary category', how: 'In the profile editor, open the business category. Pick the one that best describes the main thing you do; add secondary categories only for services you really offer.' },
  { key: 'gbp_complete', pillar: 'gbp', local: true, impact: 3, effort: 'Quick', title: 'Fill in every section: services, areas, hours, phone, website', how: 'Add each service with a short description and price if you can, your service areas or address, normal and holiday hours, phone and website.' },
  { key: 'gbp_booking', pillar: 'gbp', local: true, impact: 2, effort: 'Quick', detect: 'booking_page', title: 'Add your booking link to the profile', how: 'In the profile editor, add your booking page (Bookings → Copy booking link) as the appointment or booking link, so people book straight from Google.' },
  { key: 'gbp_photos', pillar: 'gbp', local: true, impact: 2, effort: 'Ongoing', title: 'Add real photos every week', how: 'Your team, premises or van, your work (before and after), your products. Name the image files sensibly before uploading.' },
  { key: 'gbp_posts', pillar: 'gbp', local: true, impact: 1, effort: 'Ongoing', title: 'Post updates twice a month', how: 'Offers, recent jobs, events, tips – with a photo and a “Book” or “Call” button. Content Studio can schedule these.' },
  { key: 'gbp_name', pillar: 'gbp', local: true, impact: 2, effort: 'Quick', title: 'Use your real business name – no extra keywords', how: 'Remove anything that isn’t part of your legal or trading name (e.g. “Swift Plumbing – Boiler Repair Bristol Cheap”). Keyword-stuffed names break Google’s rules.' },
  // Reviews
  { key: 'rev_link', pillar: 'reviews', local: false, impact: 3, effort: 'Quick', detect: 'review_link', title: 'Get your direct Google review link', how: 'In your Google Business Profile, use the option to ask for reviews and copy the short link it gives you. Add it in Automations → Essentials → Review request.' },
  { key: 'rev_ask', pillar: 'reviews', local: false, impact: 3, effort: 'Quick', detect: 'review_request', title: 'Ask every customer for a review, automatically', how: 'Switch on Review request in Automations → Essentials. Customers get a one-tap link a couple of hours after the job.' },
  { key: 'rev_reply', pillar: 'reviews', local: false, impact: 2, effort: 'Ongoing', title: 'Reply to every review within a few days', how: 'Thank people by name and mention the service and area naturally. For negative reviews: apologise, explain what you did, take it offline.' },
  { key: 'rev_other', pillar: 'reviews', local: false, impact: 1, effort: 'Half a day', title: 'Collect reviews on your industry’s sites too', how: 'Checkatrade/TrustATrader (trades), Treatwell/Fresha (beauty), Tripadvisor (hospitality), Trustpilot (online shops).' },
  { key: 'rev_show', pillar: 'reviews', local: false, impact: 1, effort: 'Quick', title: 'Show reviews on your website', how: 'Add recent reviews to your home and service pages, near the “Book” button.' },
  // Website & pages
  { key: 'page_services', pillar: 'onpage', local: false, impact: 3, effort: 'Half a day', title: 'Give each main service its own page', how: 'What it is, who it’s for, price or price guide, how it works, photos, reviews, FAQs and a clear call to action.' },
  { key: 'page_titles', pillar: 'onpage', local: false, impact: 3, effort: 'Quick', title: 'Write a unique title for every page', how: 'About 50–60 characters, service and place first: “Boiler Service Bristol | Swift Plumbing & Heating”.' },
  { key: 'page_meta', pillar: 'onpage', local: false, impact: 1, effort: 'Quick', title: 'Write a meta description that sells the click', how: 'About 150–160 characters: what you offer, a reason to choose you (price, speed, reviews) and a call to action.' },
  { key: 'page_h1', pillar: 'onpage', local: false, impact: 2, effort: 'Quick', title: 'One clear main heading (H1) per page', how: 'Say exactly what the page is about, e.g. “Boiler Servicing in Bristol”. Use sub-headings for each section.' },
  { key: 'page_locations', pillar: 'onpage', local: true, impact: 2, effort: 'Half a day', title: 'Create genuine pages for the main areas you cover', how: 'One page per main town or area, with real jobs, photos and reviews from there. Never copy a page and swap the town name.' },
  { key: 'page_nap', pillar: 'onpage', local: true, impact: 2, effort: 'Quick', title: 'Put your name, area and phone in the footer of every page', how: 'Exactly as on your Google profile, with the phone number tap-to-call on mobile.' },
  { key: 'page_cta', pillar: 'onpage', local: false, impact: 3, effort: 'Quick', detect: 'booking_page', title: 'Make it easy to act: call, book or WhatsApp on every page', how: 'A booking button (your booking page link), a tap-to-call number and a WhatsApp button at the top and bottom of each page.' },
  { key: 'page_links', pillar: 'onpage', local: false, impact: 1, effort: 'Quick', title: 'Link related pages to each other', how: 'Each service page links to related services; each blog post links to the service it’s about.' },
  { key: 'page_alt', pillar: 'onpage', local: false, impact: 1, effort: 'Quick', title: 'Describe your images (alt text)', how: 'A short description of each image, e.g. “New combi boiler fitted in a Bristol kitchen”. It helps image search and accessibility.' },
  // Technical
  { key: 'tech_https', pillar: 'technical', local: false, impact: 3, effort: 'Quick', title: 'Make the whole site secure (https)', how: 'Your website host or builder can switch on a free SSL certificate. Make sure http:// addresses redirect to https://.' },
  { key: 'tech_mobile', pillar: 'technical', local: false, impact: 3, effort: 'Half a day', title: 'Check every page works well on a phone', how: 'Open each page on your phone: readable text, buttons easy to tap, nothing wider than the screen, forms easy to fill in.' },
  { key: 'tech_speed', pillar: 'technical', local: false, impact: 2, effort: 'Half a day', title: 'Pass Core Web Vitals on mobile', how: 'Test at pagespeed.web.dev. Targets: main content loads under 2.5s (LCP), reacts to taps within 0.2s (INP), layout stable (CLS under 0.1). Compress images first – it’s usually the biggest fix.' },
  { key: 'tech_gsc', pillar: 'technical', local: false, impact: 3, effort: 'Quick', title: 'Set up Google Search Console and submit your sitemap', how: 'Add your site at search.google.com/search-console, verify it, submit sitemap.xml and check the Pages report for problems.' },
  { key: 'tech_index', pillar: 'technical', local: false, impact: 3, effort: 'Quick', title: 'Check Google can index your important pages', how: 'In Search Console use URL Inspection on your home and service pages. Look for any left-over “noindex” after a redesign.' },
  { key: 'tech_schema', pillar: 'technical', local: false, impact: 1, effort: 'Half a day', title: 'Add structured data for your business', how: 'LocalBusiness (or a specific type like Plumber, HairSalon, Restaurant) with name, address, phone, hours and area. Many website builders and SEO plugins do this; test it at search.google.com/test/rich-results.' },
  { key: 'tech_redirects', pillar: 'technical', local: false, impact: 1, effort: 'Quick', title: 'Fix broken links and redirect old pages', how: 'When a page moves, set a 301 redirect from the old address. Check Search Console for “Not found (404)” pages.' },
  // Content
  { key: 'content_questions', pillar: 'content', local: false, impact: 3, effort: 'Quick', title: 'List the 10 questions customers ask most', how: 'Write down what people ask before they buy. Each one is a post or an FAQ answer. Content Studio’s idea generator helps.' },
  { key: 'content_answers', pillar: 'content', local: false, impact: 2, effort: 'Ongoing', title: 'Publish one genuinely helpful answer a month (at least)', how: 'Answer the question in the first two sentences, then go deeper with real examples, prices and photos from your own work.' },
  { key: 'content_author', pillar: 'content', local: false, impact: 1, effort: 'Quick', title: 'Show who’s behind the advice', how: 'An author box with your name, photo, experience and qualifications on every article, and a proper About page.' },
  { key: 'content_refresh', pillar: 'content', local: false, impact: 1, effort: 'Ongoing', title: 'Refresh your best pages once a year', how: 'Update prices, photos, tips and the date. Search Console shows which pages bring the most clicks – start there.' },
  { key: 'content_video', pillar: 'content', local: false, impact: 1, effort: 'Ongoing', title: 'Reuse your videos and reels on your pages', how: 'Embed relevant short videos on service pages and posts, with a written summary underneath.' },
  // Links & citations
  { key: 'link_directories', pillar: 'links', local: true, impact: 2, effort: 'Half a day', title: 'List the business on the main directories, with identical details', how: 'Bing Places, Apple Business Connect, Yell, Facebook, plus your industry’s sites. Copy and paste the same name, address and phone each time.' },
  { key: 'link_nap_check', pillar: 'links', local: true, impact: 2, effort: 'Quick', title: 'Check your details are the same everywhere', how: 'Search your business name and phone number; fix any old addresses, numbers or names on listings you find.' },
  { key: 'link_local', pillar: 'links', local: false, impact: 2, effort: 'Ongoing', title: 'Earn local and industry mentions', how: 'Suppliers, partners, local groups, sponsorships, charity work, local news. One genuine local link beats dozens of directory links.' },
  { key: 'link_partners', pillar: 'links', local: false, impact: 1, effort: 'Ongoing', title: 'Team up with complementary businesses', how: 'Feature each other: a kitchen fitter and an electrician, a salon and a wedding venue, a coach and an accountant.' },
  { key: 'link_no_buying', pillar: 'links', local: false, impact: 2, effort: 'Quick', title: 'Never buy links or link packages', how: 'Buying links is against Google’s spam policies and can wipe out your rankings. If anyone offers “500 backlinks for £50”, say no.' },
  // Measuring
  { key: 'measure_ga', pillar: 'measure', local: false, impact: 2, effort: 'Half a day', title: 'Track enquiries and bookings in Google Analytics', how: 'Set up GA4 and mark form sends, booking clicks and phone taps as key events, so you know which pages create customers.' },
  { key: 'measure_source', pillar: 'measure', local: false, impact: 3, effort: 'Quick', detect: 'lead_source', title: 'Tag every lead with where it came from', how: 'Switch on Lead source tagging in Automations → Essentials, and ask new customers “how did you find us?”.' },
  { key: 'measure_monthly', pillar: 'measure', local: false, impact: 2, effort: 'Ongoing', title: 'Review the numbers once a month', how: 'Google clicks and top searches (Search Console), profile calls and bookings, leads tagged Google, and how many became customers. Keep notes in the Keywords tab.' },
];

// ───────────────────────── What to offer (agency packages) ─────────────────────────

export const PACKAGES = [
  {
    key: 'local_starter', name: 'Local SEO Starter', for: 'Local businesses that aren’t showing in the map yet, or have few reviews',
    includes: ['Google Business Profile set up or fixed: categories, services, areas, booking link, photos', 'Review requests switched on, with replies drafted for the first month', 'Main directory listings created or corrected with consistent details', 'Search Console and Analytics set up, with enquiries tracked', 'Home page and top 3 service pages given proper titles, headings and calls to action'],
    gets: ['Showing properly in Google Maps for your main services', 'A steady flow of new reviews', 'Calls and bookings straight from Google', 'A clear picture of where leads come from'],
    needs: ['Access to the Google profile and website', 'Photos of your work, team and premises', 'A list of services, prices from and areas covered'],
    timeline: 'Set up in 2–4 weeks; first results usually within 2–3 months.',
  },
  {
    key: 'local_growth', name: 'Local SEO Growth (monthly)', for: 'Local businesses that want to win more of the map and organic results month after month',
    includes: ['Everything in Starter, kept up to date', 'Two Google profile posts and new photos every month', 'One location or service page a month', 'One helpful article a month answering a real customer question', 'Local link and partnership outreach', 'A monthly report: calls, bookings, reviews, top searches and leads from Google'],
    gets: ['More calls and bookings from Google each month', 'Pages ranking for more services and areas', 'Reviews and content that keep you ahead of competitors', 'Lower cost per lead than ads over time'],
    needs: ['15 minutes a month to answer questions and approve content', 'Photos from recent jobs', 'Keep asking customers for reviews (automated)'],
    timeline: 'Ongoing; clear growth usually from months 4–6, compounding through year one.',
  },
  {
    key: 'content_authority', name: 'Content & Authority', for: 'Coaches, consultants, agencies and online businesses whose customers research before buying',
    includes: ['Keyword and question research for your services', 'Two in-depth articles or case studies a month, written from your experience', 'Service and offer pages rewritten around what people search', 'Author profile and About page that show expertise', 'Repurposing your videos and posts into searchable content', 'Monthly report: impressions, clicks, enquiries and best performing content'],
    gets: ['Discovery calls and enquiries from people who already trust you', 'Clients beyond your local area', 'Authority that supports higher prices', 'Content you also use in sales and social'],
    needs: ['A 30-minute interview each month (we turn it into content)', 'Client stories and permission to use them'],
    timeline: 'Ongoing; content usually starts bringing traffic in 3–6 months and keeps building.',
  },
  {
    key: 'ecommerce', name: 'E-commerce SEO', for: 'Online shops that want more sales without relying on ads and marketplaces',
    includes: ['Technical audit: speed, indexing, duplicate pages from filters and variants', 'Category pages improved with buying advice and internal links', 'Product descriptions rewritten (unique, detailed, with reviews)', 'Seasonal gift guides planned ahead of the big dates', 'Product structured data checked', 'Monthly report: organic orders and revenue'],
    gets: ['More orders from people searching for your products', 'Less spent on ads and marketplace fees', 'Seasonal traffic that returns every year'],
    needs: ['Access to the shop platform', 'Product details, photos and reviews'],
    timeline: 'Technical fixes in month one; category and product gains usually within 3–6 months.',
  },
];
