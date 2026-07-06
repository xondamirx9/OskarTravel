// «Сгенерировать план на неделю»: план → тексты → промпты Higgsfield → черновики в очередь модерации.
const crypto = require('crypto');
const db = require('../lib/db');
const { planWeek } = require('./planner');
const { writePost } = require('./writer');
const { buildPrompt } = require('./higgsfield');
const { logger } = require('../lib/logger');

const log = logger('generate');

async function generateWeek(startDate) {
  const slots = planWeek(startDate);
  log.info(`План на неделю: ${slots.length} слотов`);

  const drafts = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const post = await writePost(slot, i);
    drafts.push({
      id: crypto.randomUUID(),
      status: 'draft',
      createdAt: new Date().toISOString(),
      ...post,
      higgsfieldPrompt: buildPrompt(slot.rubric, post.tour ? post.tour.destination : ''),
      media: { video: null, photos: [] },
      results: {},
      log: [{ ts: new Date().toISOString(), event: 'created', by: post.generatedBy }],
    });
  }

  db.update('posts', (posts) => { posts.push(...drafts); });
  log.info(`Создано черновиков: ${drafts.length} (генератор: ${drafts[0]?.generatedBy || '—'})`);
  return drafts;
}

module.exports = { generateWeek };
