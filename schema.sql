/* Run this ONCE in the Cloudflare D1 dashboard query console for the
   existing `arcade-scores` database (the same one Typing Racer uses — this
   just adds a second, separate table to it, so nothing here touches the
   star-typer `scores` table). See README.md for the full walkthrough.

   Block comment (not "--" line comments) on purpose: some paste targets
   collapse newlines, and a "--" comment with no trailing newline swallows
   everything after it, which makes D1 report "Requests without any query
   are not supported". */

CREATE TABLE IF NOT EXISTS td_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board TEXT NOT NULL,            /* difficulty: beginner | normal | veteran */
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  level INTEGER NOT NULL,         /* level reached, 1..40 */
  won INTEGER NOT NULL DEFAULT 0, /* 1 if they cleared the level */
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_td_scores_board_score ON td_scores (board, score DESC);
