/**
 * Niche presets. When a new business is onboarded, its niche seeds the brand
 * profile, content pillars and idea vocabulary so the system is useful on day one
 * without any setup. Add a new niche here and every module picks it up.
 */
export const NICHES = {
  coaching: {
    label: 'Coaching & Consulting',
    businessType: 'service',
    audience: 'Ambitious professionals who want faster results with expert guidance',
    pains: ['feeling stuck despite working hard', 'no clear plan or accountability', 'wasting money on courses that never get finished'],
    desires: ['a clear step-by-step plan', 'confidence to make big decisions', 'measurable progress every month'],
    offers: ['1:1 coaching programme', 'group coaching', 'strategy intensive'],
    pillars: [
      { name: 'Education', description: 'Teach frameworks and quick wins from your method' },
      { name: 'Client Results', description: 'Case studies, transformations and testimonials' },
      { name: 'Mindset & Story', description: 'Your journey, beliefs and lessons learned' },
      { name: 'Offer & Invitation', description: 'Direct invitations to work with you' },
    ],
    platforms: ['instagram', 'linkedin', 'youtube'],
    topics: ['goal setting', 'productivity', 'confidence', 'career change', 'accountability'],
  },
  ecommerce: {
    label: 'E-commerce & Products',
    businessType: 'product',
    audience: 'Online shoppers who care about quality, value and a good story behind the brand',
    pains: ['cheap products that break quickly', 'not knowing which option is right for them', 'slow delivery and poor support'],
    desires: ['products that last', 'feeling good about what they buy', 'fast, easy ordering'],
    offers: ['bestselling product', 'bundles', 'subscription refills'],
    pillars: [
      { name: 'Product Education', description: 'How to use, style or get the most from products' },
      { name: 'Social Proof', description: 'Reviews, UGC and unboxings' },
      { name: 'Behind the Brand', description: 'Making-of, packing orders, the team' },
      { name: 'Promotions', description: 'Launches, drops and limited offers' },
    ],
    platforms: ['instagram', 'tiktok', 'facebook'],
    topics: ['product care', 'gift ideas', 'sustainability', 'styling', 'bundles'],
  },
  local_services: {
    label: 'Local Services & Trades',
    businessType: 'service',
    audience: 'Homeowners and local businesses who want reliable, fairly priced tradespeople',
    pains: ['tradespeople who never turn up', 'surprise costs at the end of a job', 'poor workmanship that needs redoing'],
    desires: ['a job done right first time', 'clear pricing upfront', 'someone they can trust in their home'],
    offers: ['free quote', 'maintenance plan', 'emergency call-out'],
    pillars: [
      { name: 'Before & After', description: 'Show the transformation of real jobs' },
      { name: 'Tips & Maintenance', description: 'Helpful advice that builds trust' },
      { name: 'Trust & Team', description: 'Meet the team, accreditations, reviews' },
      { name: 'Offers & Seasonal', description: 'Seasonal reminders and booking prompts' },
    ],
    platforms: ['facebook', 'instagram', 'google_business'],
    topics: ['home maintenance', 'energy saving', 'seasonal checks', 'safety', 'renovation'],
  },
  fitness: {
    label: 'Health & Fitness',
    businessType: 'service',
    audience: 'Busy adults who want to get fitter and healthier without extreme diets',
    pains: ['no time to train', 'confusing, conflicting advice', 'starting and stopping over and over'],
    desires: ['sustainable routines', 'more energy', 'visible results they can keep'],
    offers: ['personal training', 'online programme', 'nutrition coaching'],
    pillars: [
      { name: 'Workouts & Technique', description: 'Short, practical training content' },
      { name: 'Nutrition', description: 'Simple food advice and myth busting' },
      { name: 'Transformations', description: 'Client journeys and wins' },
      { name: 'Lifestyle & Motivation', description: 'Habits, mindset and daily life' },
    ],
    platforms: ['instagram', 'tiktok', 'youtube'],
    topics: ['fat loss', 'strength training', 'meal prep', 'habits', 'recovery'],
  },
  beauty: {
    label: 'Beauty & Salon',
    businessType: 'service',
    audience: 'Clients who want to look and feel their best with a salon they can trust',
    pains: ['results that don’t match the photo', 'rushed appointments', 'treatments that don’t last'],
    desires: ['a signature look', 'a relaxing experience', 'expert, personal advice'],
    offers: ['signature treatment', 'membership', 'gift vouchers'],
    pillars: [
      { name: 'Transformations', description: 'Before/after and process videos' },
      { name: 'Aftercare & Tips', description: 'Help clients keep results at home' },
      { name: 'Salon Life', description: 'The team, the space, the vibe' },
      { name: 'Booking & Offers', description: 'Availability and seasonal offers' },
    ],
    platforms: ['instagram', 'tiktok', 'facebook'],
    topics: ['aftercare', 'trends', 'skin health', 'bridal', 'maintenance'],
  },
  hospitality: {
    label: 'Hospitality & Food',
    businessType: 'hybrid',
    audience: 'Locals and visitors looking for memorable food, drink and experiences',
    pains: ['bland, forgettable meals', 'not knowing what’s on or when', 'overpriced for the experience'],
    desires: ['a great night out', 'food worth sharing', 'feeling like a regular'],
    offers: ['signature menu', 'events', 'private hire'],
    pillars: [
      { name: 'Menu & Dishes', description: 'Mouth-watering food and drink content' },
      { name: 'Behind the Pass', description: 'Chefs, suppliers and preparation' },
      { name: 'Events & What’s On', description: 'Upcoming events and specials' },
      { name: 'Guest Moments', description: 'Reviews and guest content' },
    ],
    platforms: ['instagram', 'tiktok', 'facebook'],
    topics: ['seasonal menu', 'local suppliers', 'events', 'cocktails', 'celebrations'],
  },
  agency: {
    label: 'Agency & Creative',
    businessType: 'service',
    audience: 'Business owners who need marketing, design or tech done properly',
    pains: ['agencies that overpromise and underdeliver', 'no idea what’s working', 'slow turnaround'],
    desires: ['measurable growth', 'a partner who understands them', 'work they are proud of'],
    offers: ['monthly retainer', 'project sprint', 'audit'],
    pillars: [
      { name: 'Expertise', description: 'Teach what you know, share frameworks' },
      { name: 'Case Studies', description: 'Results you have delivered for clients' },
      { name: 'Process & Culture', description: 'How you work and who you are' },
      { name: 'Offers', description: 'Audits, calls and service invitations' },
    ],
    platforms: ['linkedin', 'instagram', 'youtube'],
    topics: ['marketing strategy', 'branding', 'automation', 'websites', 'growth'],
  },
  real_estate: {
    label: 'Real Estate & Property',
    businessType: 'service',
    audience: 'Buyers, sellers and landlords who want a smooth, profitable move',
    pains: ['homes sitting on the market for months', 'hidden fees', 'agents who go quiet'],
    desires: ['the best price', 'a fast, stress-free move', 'honest local advice'],
    offers: ['free valuation', 'property management', 'buyer consultation'],
    pillars: [
      { name: 'Listings & Tours', description: 'Property walk-throughs and highlights' },
      { name: 'Market Insight', description: 'Local market updates and advice' },
      { name: 'Success Stories', description: 'Sold stories and happy movers' },
      { name: 'Local Life', description: 'The area, businesses and community' },
    ],
    platforms: ['instagram', 'facebook', 'youtube'],
    topics: ['selling tips', 'first-time buyers', 'market update', 'staging', 'investing'],
  },
  saas: {
    label: 'Software & Tech',
    businessType: 'product',
    audience: 'Teams who want tools that save time and just work',
    pains: ['manual, repetitive work', 'tools that don’t talk to each other', 'complicated onboarding'],
    desires: ['hours saved every week', 'clear reporting', 'a tool the team actually uses'],
    offers: ['free trial', 'team plan', 'onboarding call'],
    pillars: [
      { name: 'Product Tips', description: 'Features, shortcuts and use cases' },
      { name: 'Customer Stories', description: 'How customers win with the product' },
      { name: 'Industry Insight', description: 'Trends and opinions in your space' },
      { name: 'Build in Public', description: 'Roadmap, releases and the team' },
    ],
    platforms: ['linkedin', 'x', 'youtube'],
    topics: ['productivity', 'automation', 'integrations', 'reporting', 'remote teams'],
  },
};

export const PLATFORMS = {
  instagram: { label: 'Instagram', formats: ['reel', 'carousel', 'static', 'story'] },
  tiktok: { label: 'TikTok', formats: ['short_video', 'story'] },
  youtube: { label: 'YouTube', formats: ['long_video', 'short_video'] },
  linkedin: { label: 'LinkedIn', formats: ['text_post', 'carousel', 'short_video'] },
  facebook: { label: 'Facebook', formats: ['static', 'short_video', 'text_post'] },
  x: { label: 'X (Twitter)', formats: ['text_post', 'thread'] },
  google_business: { label: 'Google Business', formats: ['static', 'text_post'] },
  newsletter: { label: 'Newsletter / Blog', formats: ['article'] },
};

export const FORMAT_LABELS = {
  reel: 'Reel', short_video: 'Short video', long_video: 'Long-form video', carousel: 'Carousel',
  static: 'Single image', story: 'Story', text_post: 'Text post', thread: 'Thread', article: 'Article / email',
};

export function getNiche(key) {
  return NICHES[key] || NICHES.coaching;
}
