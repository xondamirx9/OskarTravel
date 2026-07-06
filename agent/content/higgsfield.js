// Промпты для Higgsfield в едином стиле бренда (см. docs/brand-guide.md §5).
// Публичного API у Higgsfield нет — промпт генерируется для ручной генерации,
// готовый файл загружается к посту в дашборде.
const { getSettings } = require('../lib/settings');

const BRAND_STYLE = [
  'Cinematic travel footage, golden hour warm sunlight',
  'slow dolly-in camera movement with subtle parallax',
  'rich natural colors with warm bronze undertones',
  'shallow depth of field, anamorphic lens feel',
  'no text, no captions, no logos in frame',
  'vertical 9:16 composition, main subject in upper two thirds of the frame',
].join(', ');

const SCENES = {
  hot: (d) => `A breathtaking establishing shot of ${d}: turquoise sea meeting a sunlit beach, gentle waves, a luxury resort in the background, palm leaves swaying in the foreground`,
  guide: (d) => `A traveler's point-of-view walking through the most iconic location of ${d}, locals and atmosphere around, morning light`,
  review: (d) => `A happy couple laughing on a hotel balcony overlooking ${d} at sunset, candid documentary style, warm intimate mood`,
  reels: (d) => `A drone shot slowly revealing the skyline and coastline of ${d} at golden hour, birds crossing the frame`,
  backstage: () => `A cozy travel agency office scene: a manager smiling while showing a tablet with beach photos to clients, warm interior light, plants and travel posters`,
  promo: (d) => `A suitcase opening in slow motion on a bed, travel essentials flying out gently, window with a view of ${d} behind, playful festive mood`,
};

const MOODS = {
  hot: 'exciting, urgent yet inviting',
  guide: 'curious, informative, wanderlust',
  review: 'heartwarming, trustworthy, joyful',
  reels: 'epic, awe-inspiring, dreamlike',
  backstage: 'warm, human, professional',
  promo: 'festive, playful, generous',
};

/**
 * Детальный промпт для Higgsfield под пост.
 * @param {string} rubric — ключ рубрики
 * @param {string} destination — направление («Дубай, ОАЭ») или ''
 */
function buildPrompt(rubric, destination) {
  const settings = getSettings();
  const dest = destination || settings.destinations[0] || 'a tropical seaside destination';
  const scene = (SCENES[rubric] || SCENES.reels)(dest);
  const mood = MOODS[rubric] || MOODS.reels;
  return [
    `SCENE: ${scene}.`,
    `STYLE: ${BRAND_STYLE}.`,
    `MOOD: ${mood}.`,
    'DURATION: 7-12 seconds, seamless loop preferred.',
    `NOTE: footage will be used with a branded overlay (deep navy #182948 gradient at the bottom, bronze #C56B2C accents) — keep the lower third visually calm.`,
  ].join('\n');
}

module.exports = { buildPrompt };
