/**
 * The three ways one script is produced. The words and the structure stay the
 * same; only how each line reaches the viewer changes.
 *
 *  faceless   – being made now. On-screen text and captions over b-roll and the
 *               screen recording. No face, no voice.
 *  voiceover  – next. Your voice over the same visuals.
 *  on_camera  – later. Your face, filmed as the foundation describes.
 *
 * on_camera directions are the foundation's own filming notes, word for word.
 */

export const FORMATS = {
  faceless: {
    label: 'Faceless', status: 'now',
    summary: 'On-screen text and captions over b-roll and the screen recording. No face, no voice. Low music underneath, never a build-up before the first line.',
    delivery: 'text',
    // Reading pace for on-screen text, and how long one card may be.
    words_per_second: 3, card_max_words: 9, card_min_seconds: 1.2,
    directions: {
      hook: 'The hook appears as on-screen text in the very first frame, over a tight shot of the problem. No logo intro or music build-up first.',
      problem: 'Short text cards over calm, familiar b-roll of their day. Keep it calm and familiar rather than doom and gloom. They should nod along, not feel told off.',
      solution: 'The one-line method as a full-screen text card, then the screen recording with captions and call-outs on each step. Leave the add-on details to the breakdown video.',
      proof: 'Screenshots of the log sheet and weekly report (customer details blurred), the real numbers as text, then the owner’s two-line quote on screen (or their 15 to 20 second clip, captioned).',
      cta: 'The CTA as on-screen text, said once, with an arrow pointing down towards the button. The button uses the same words.',
    },
  },
  voiceover: {
    label: 'Voiceover', status: 'next',
    summary: 'Your voice over the same visuals as the faceless cut. Captions stay on.',
    delivery: 'voice',
    words_per_second: 2.5,
    directions: {
      hook: 'Your first word is on the first frame, over a tight shot of the problem. No logo intro or music build-up first.',
      problem: 'Voiceover over b-roll of their day. Keep it calm and familiar rather than doom and gloom. They should nod along, not feel told off.',
      solution: 'Say the one-line method over a clean title card, then voiceover over the screen recording. Leave the add-on details to the breakdown video.',
      proof: 'Voiceover over the screenshots (customer details blurred), then cut to the owner’s clip or quote.',
      cta: 'Say it once, clearly, as an arrow points down towards the button.',
    },
  },
  on_camera: {
    label: 'On camera', status: 'later',
    summary: 'Your face, filmed as the foundation describes.',
    delivery: 'voice',
    words_per_second: 2.5,
    directions: {
      hook: 'On camera, in a tight shot. No logo intro or music build-up first, so your first word is in the first frame.',
      problem: 'On camera. Keep it calm and familiar rather than doom and gloom. They should nod along, not feel told off.',
      solution: 'The one-line method on camera, then voiceover over the screen recording. Leave the add-on details to the breakdown video.',
      proof: 'Screenshots of the log sheet and weekly report (customer details blurred), with the owner’s clip or two-line quote.',
      cta: 'On camera. Point down towards the link and say it once, clearly.',
    },
  },
};

export const formatOf = (key) => FORMATS[key] || FORMATS.faceless;
