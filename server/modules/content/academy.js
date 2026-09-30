/**
 * Creation Academy: short, practical lessons that teach clients how to turn an
 * idea + brief into a finished piece of content themselves. The system supplies
 * the idea and structure; the client adds their voice, films/designs and finalises.
 */
export const LESSONS = [
  {
    key: 'short_video',
    title: 'Film a short-form video (Reels, TikTok, Shorts)',
    formats: ['reel', 'short_video'],
    minutes: 8,
    summary: 'Plan, film and edit a 15–45 second vertical video on your phone.',
    steps: [
      'Read the brief’s outline and write one line per beat – that’s your script.',
      'Film vertically (9:16) facing a window for natural light. Clean your lens.',
      'Say the hook in the first 2 seconds – start mid-sentence, no “Hi guys”.',
      'Film each beat as a separate clip so mistakes are easy to cut.',
      'Edit in CapCut/Instagram: trim pauses, add auto-captions, keep it under 45s.',
      'Add on-screen text for the hook and pick a trending sound at low volume.',
      'Export, then paste your final caption into the Creation panel and mark it finalised.',
    ],
    tips: ['Batch-film 3–5 videos in one session', 'Change location/angle every few seconds to hold attention'],
  },
  {
    key: 'carousel',
    title: 'Design a carousel that gets saved',
    formats: ['carousel'],
    minutes: 6,
    summary: 'Turn the outline into a 5–10 slide swipeable post.',
    steps: [
      'Slide 1 = the hook in big bold text (max 8 words).',
      'One outline beat per slide – one idea per slide only.',
      'Use your brand colours and one font; keep 40px margins.',
      'Final slide = recap + call to action (“Save this”, “Follow for more”).',
      'Design in Canva using a 1080×1350 portrait template.',
      'Export as PNGs and upload them in order with the finalised caption.',
    ],
    tips: ['Use arrows or “swipe →” on slide 1', 'Readable on a phone at arm’s length? If not, cut words'],
  },
  {
    key: 'static',
    title: 'Create a single-image post',
    formats: ['static'],
    minutes: 4,
    summary: 'A single photo or graphic with a caption that does the heavy lifting.',
    steps: [
      'Choose a real photo (you, your team, your work) – real beats stock.',
      'If it’s a graphic, put the hook on it in large text.',
      'Write the caption using the caption template in the brief.',
      'Put the most important line first – it shows before “more”.',
    ],
    tips: ['Faces get more engagement than objects', 'Before/after images work brilliantly as a side-by-side'],
  },
  {
    key: 'story',
    title: 'Post Stories that start conversations',
    formats: ['story'],
    minutes: 4,
    summary: 'Casual, behind-the-scenes frames with interactive stickers.',
    steps: [
      'Plan 3–5 frames: hook → context → value → question/poll → CTA.',
      'Film casually – Stories reward authenticity over polish.',
      'Add a poll, quiz or question sticker to get replies.',
      'Reply to every response – replies land in the inbox and build relationships.',
    ],
    tips: ['Save good Stories to Highlights', 'Use the link sticker on the CTA frame'],
  },
  {
    key: 'text_post',
    title: 'Write a text post (LinkedIn, Facebook, X)',
    formats: ['text_post', 'thread'],
    minutes: 5,
    summary: 'Short paragraphs, strong first line, one clear takeaway.',
    steps: [
      'Line 1 is the hook – it must make people click “see more”.',
      'Write 1–2 sentence paragraphs with space between them.',
      'Tell a story or give a list using the brief’s outline.',
      'End with a question to invite comments.',
      'Read it out loud and cut 20% of the words.',
    ],
    tips: ['Post when your audience is online (check insights)', 'Reply to comments within the first hour'],
  },
  {
    key: 'long_video',
    title: 'Record a long-form video (YouTube)',
    formats: ['long_video'],
    minutes: 10,
    summary: 'A 6–15 minute video that fully answers one question.',
    steps: [
      'Write a title and thumbnail idea first – they decide who clicks.',
      'Open with the result/promise in the first 15 seconds.',
      'Use the outline as chapters; add B-roll for each section.',
      'Record horizontally, eye-level camera, good microphone.',
      'Edit out mistakes, add chapters in the description, end with a CTA.',
    ],
    tips: ['Cut 3 Shorts from every long video', 'Thumbnail: face + 3–4 words max'],
  },
  {
    key: 'article',
    title: 'Write a blog post or newsletter',
    formats: ['article'],
    minutes: 8,
    summary: 'Turn the outline into an 600–1200 word piece.',
    steps: [
      'Use the outline beats as H2 subheadings.',
      'Write a 2–3 sentence intro that restates the problem and promise.',
      'Add an example, story or data point in every section.',
      'Finish with a summary and a single call to action.',
      'Proofread, add an image, then paste the final version here.',
    ],
    tips: ['One newsletter can be split into 3–5 social posts', 'Use short sentences'],
  },
  {
    key: 'hooks',
    title: 'Master hooks in 5 minutes',
    formats: [],
    minutes: 5,
    summary: 'The first line decides whether anyone sees the rest.',
    steps: [
      'Call out the audience: “If you’re a [who] struggling with [pain]…”.',
      'Create curiosity: “Nobody talks about this…”.',
      'Promise an outcome: “How to [result] in [time]”.',
      'Challenge a belief: “Stop doing [common thing]”.',
      'Always pick the hook that is most specific.',
    ],
    tips: ['Write 3 hooks, pick the best', 'Numbers and specifics beat vague claims'],
  },
  {
    key: 'batching',
    title: 'Batch a week of content in 2 hours',
    formats: [],
    minutes: 6,
    summary: 'A simple weekly rhythm so content never becomes a daily stress.',
    steps: [
      'Monday: open the Idea Lab and shortlist the week’s ideas (15 min).',
      'Review each brief and write your scripts/captions (45 min).',
      'Film or design everything in one block (45 min).',
      'Finalise each piece in the Creation panel (15 min).',
      'Schedule them all in the calendar – the system publishes them for you.',
    ],
    tips: ['Protect the batching slot in your calendar', 'Keep an ideas note on your phone'],
  },
];

export function lessonForFormat(format) {
  return LESSONS.find((l) => l.formats.includes(format)) || null;
}
