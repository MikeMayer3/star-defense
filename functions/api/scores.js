// Star Defense leaderboard API. Same-origin (served by _worker.js), so no
// CORS. Backed by a D1 database bound as `DB` — the shared `arcade-scores`
// database, but its own `td_scores` table, so it's fully decoupled from
// Typing Racer's `scores` table. Written as Pages-Function exports so it
// could move to classic Pages unchanged.

const TOP_N = 20;
const MAX_KEEP_PER_BOARD = 300; // prune old low scores so a board can't grow forever
const MAX_NAME_LEN = 12;
// Boards are difficulty tiers — scores across tiers aren't comparable, so
// each tier is its own board. Must match the game's difficulty ids.
const BOARDS = ['beginner', 'normal', 'veteran'];

function isValidBoard(board) {
  return typeof board === 'string' && BOARDS.includes(board);
}

function clampInt(val, min, max) {
  const n = Math.trunc(Number(val));
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const board = url.searchParams.get('board') || 'normal';
  if (!isValidBoard(board)) return json({ error: 'invalid board' }, 400);

  const { results } = await env.DB.prepare(
    'SELECT name, score, level, won FROM td_scores WHERE board = ?1 ORDER BY score DESC LIMIT ?2'
  ).bind(board, TOP_N).all();

  return json(results);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'invalid json' }, 400);
  }

  const board = body.board;
  if (!isValidBoard(board)) return json({ error: 'invalid board' }, 400);

  const name = (typeof body.name === 'string' ? body.name : 'PILOT').trim().slice(0, MAX_NAME_LEN) || 'PILOT';
  const score = clampInt(body.score, 0, 100_000_000);
  const level = clampInt(body.level, 1, 1000);
  const won = body.won ? 1 : 0;

  if (score === null || level === null) return json({ error: 'invalid fields' }, 400);

  await env.DB.prepare(
    `INSERT INTO td_scores (board, name, score, level, won, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
  ).bind(board, name, score, level, won, Date.now()).run();

  // Keep only the top MAX_KEEP_PER_BOARD rows per board so the table doesn't
  // grow without bound as more people play.
  await env.DB.prepare(
    `DELETE FROM td_scores WHERE board = ?1 AND id NOT IN (
       SELECT id FROM td_scores WHERE board = ?1 ORDER BY score DESC LIMIT ?2
     )`
  ).bind(board, MAX_KEEP_PER_BOARD).run();

  const { results } = await env.DB.prepare(
    'SELECT name, score, level, won FROM td_scores WHERE board = ?1 ORDER BY score DESC LIMIT ?2'
  ).bind(board, TOP_N).all();

  return json(results);
}
