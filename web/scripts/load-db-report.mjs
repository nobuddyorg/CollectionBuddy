// What Postgres did during a k6 run on the local stack: statements by time and by calls, scans per table, use per index.
import { execFileSync } from 'node:child_process';

const TOP_BY_TIME = 15;
const TOP_BY_CALLS = 10;
// Our own snapshot queries run as postgres; supabase_admin is the platform's.
const OWN_ROLES = "('postgres', 'supabase_admin')";

// Transaction control and PostgREST's per-request set_config preamble: on every request, so they only crowd the table.
const PLUMBING = "'^\\s*(begin|commit|rollback|set |select set_config\\()'";

// track = top: a SECURITY DEFINER function's inner statements count toward the call that ran it.
const STATEMENTS_SQL = `
  select coalesce(json_agg(t), '[]') from (
    select
      r.rolname as role,
      s.calls,
      s.total_exec_time as total_ms,
      s.max_exec_time as max_ms,
      s.rows,
      s.shared_blks_hit as hit,
      s.shared_blks_read as read,
      regexp_replace(s.query, '\\s+', ' ', 'g') as query
    from extensions.pg_stat_statements s
    join pg_catalog.pg_roles r on r.oid = s.userid
    where s.dbid = (select oid from pg_catalog.pg_database where datname = current_database())
      and r.rolname not in ${OWN_ROLES}
      and s.query !~* ${PLUMBING}
  ) t`;

const TABLES_SQL = `
  select coalesce(json_agg(t), '[]') from (
    select relname as table, seq_scan, seq_tup_read, coalesce(idx_scan, 0) as idx_scan, coalesce(idx_tup_fetch, 0) as idx_tup_fetch
    from pg_catalog.pg_stat_user_tables
    where schemaname = 'public'
  ) t`;

const INDEXES_SQL = `
  select coalesce(json_agg(t), '[]') from (
    select relname as table, indexrelname as index, idx_scan
    from pg_catalog.pg_stat_user_indexes
    where schemaname = 'public'
  ) t`;

// A backend with nothing to do flushes its pending table counters within 10 s (PGSTAT_IDLE_INTERVAL).
export const STATS_FLUSH_MS = 11000;

function query(databaseUrl, sql) {
  return JSON.parse(
    execFileSync(
      'psql',
      [databaseUrl, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql],
      {
        encoding: 'utf8',
      },
    ),
  );
}

/** Clears pg_stat_statements and returns the table and index counters to diff against. */
export function startDatabaseCapture(databaseUrl) {
  query(
    databaseUrl,
    "select json_build_object('reset', extensions.pg_stat_statements_reset())",
  );
  return {
    tables: query(databaseUrl, TABLES_SQL),
    indexes: query(databaseUrl, INDEXES_SQL),
  };
}

export function finishDatabaseCapture(databaseUrl, before) {
  return {
    statements: query(databaseUrl, STATEMENTS_SQL),
    tables: diffBy({
      key: 'table',
      before: before.tables,
      after: query(databaseUrl, TABLES_SQL),
    }),
    indexes: diffBy({
      key: 'index',
      before: before.indexes,
      after: query(databaseUrl, INDEXES_SQL),
    }),
  };
}

/** `after` minus `before`, row by row on `key`, for every numeric field. */
function diffBy({ key, before, after }) {
  const earlier = new Map(before.map((row) => [row[key], row]));
  return after.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([field, value]) => [
        field,
        typeof value === 'number'
          ? value - (earlier.get(row[key])?.[field] ?? 0)
          : value,
      ]),
    ),
  );
}

const milliseconds = (value) => value.toFixed(1);
// Backslashes first, so the pipe escape cannot be undone by one already in the text; a backtick would close the code span.
const cell = (text) =>
  text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/`/g, "'");

function statementRows(statements, total) {
  return statements.map((statement) => {
    const blocks = statement.hit + statement.read;
    return `| ${milliseconds(statement.total_ms)} | ${((100 * statement.total_ms) / total).toFixed(1)}% | ${statement.calls} | ${milliseconds(statement.total_ms / statement.calls)} | ${milliseconds(statement.max_ms)} | ${statement.rows} | ${blocks ? `${((100 * statement.hit) / blocks).toFixed(1)}%` : '–'} | ${statement.role} | \`${cell(statement.query.slice(0, 160))}\` |`;
  });
}

const STATEMENT_HEADER = [
  '| Total ms | Share | Calls | Mean ms | Max ms | Rows | Cache hit | Role | Query |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
];

/** The capture as Markdown: a pure function of what finishDatabaseCapture returned. */
export function databaseReportMarkdown(title, { statements, tables, indexes }) {
  const total =
    statements.reduce((sum, statement) => sum + statement.total_ms, 0) || 1;
  const byTime = [...statements]
    .sort((a, b) => b.total_ms - a.total_ms)
    .slice(0, TOP_BY_TIME);
  const byCalls = [...statements]
    .sort((a, b) => b.calls - a.calls)
    .slice(0, TOP_BY_CALLS);
  const scanned = [...tables].sort((a, b) => b.seq_tup_read - a.seq_tup_read);
  const unused = indexes
    .filter((index) => index.idx_scan === 0)
    .map((index) => `\`${index.index}\``);
  return [
    `## Postgres during the run: ${title}`,
    '',
    "From `pg_stat_statements` (reset as the run started) and the table and index counters (after minus before). Setup and teardown included; a `SECURITY DEFINER` function's own statements count toward the call that ran it.",
    '',
    `### Most time in total (top ${TOP_BY_TIME})`,
    '',
    ...STATEMENT_HEADER,
    ...statementRows(byTime, total),
    '',
    `### Most calls (top ${TOP_BY_CALLS})`,
    '',
    ...STATEMENT_HEADER,
    ...statementRows(byCalls, total),
    '',
    '### Table access',
    '',
    'A sequential scan reading many rows on a table the app filters is the first thing to check against `075_query_plans_test.sql`.',
    '',
    '| Table | Seq scans | Rows read by seq scans | Index scans | Rows fetched by index |',
    '| --- | --- | --- | --- | --- |',
    ...scanned.map(
      (table) =>
        `| ${table.table} | ${table.seq_scan} | ${table.seq_tup_read} | ${table.idx_scan} | ${table.idx_tup_fetch} |`,
    ),
    '',
    '### Index use',
    '',
    '| Index | Table | Scans |',
    '| --- | --- | --- |',
    ...[...indexes]
      .sort((a, b) => b.idx_scan - a.idx_scan)
      .map(
        (index) => `| ${index.index} | ${index.table} | ${index.idx_scan} |`,
      ),
    '',
    unused.length
      ? `Not used during this run: ${unused.join(', ')}.`
      : 'Every index was used.',
    '',
  ].join('\n');
}
