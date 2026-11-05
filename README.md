# codechef-mcp

[![npm](https://img.shields.io/npm/v/codechef-mcp)](https://www.npmjs.com/package/codechef-mcp)
[![CI](https://github.com/sarthaksec/codechef-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/sarthaksec/codechef-mcp/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

An MCP server that turns CodeChef user profiles into **structured JSON** for LLMs — no more
dumping 180 KB of HTML into the context window and hoping the model finds the rating.

Written in plain Node.js (ESM). No build step.

## Why

A CodeChef profile page is ~180 KB of markup. Most of the useful data is actually already
machine-readable inside it, just buried:

| Data | Where it lives |
| --- | --- |
| Contest rating history | `var all_rating = [...]` |
| Submission heat map | `userDailySubmissionsStats = [...]` |
| Name, stars, country, role, organisation | `.user-details` sidebar |
| Rating, division, global/country rank | `#rating-block-all` |
| Problems solved total | `Total Problems Solved: N` |
| Per-contest solved problems | `.problems-solved .content` |

This server extracts those into typed fields, normalizes dates/numbers, computes deltas, and
returns compact JSON (a few KB) instead of raw HTML.

## Tools

OpenCode prefixes tool names with the server name, so a server named `codechef` exposes them as
`codechef_get_profile`, `codechef_get_rating_history`, and so on.

| Tool | Returns |
| --- | --- |
| `get_profile` | Name, stars, country, role, organisation, current/highest rating, division, global rank, country rank, problems solved, contest count, latest contest, best rating, last 5 contests |
| `get_rating_history` | Newest-first contest list with `rating`, `ratingChange` delta and `rank` |
| `get_activity` | Submission heat map summary: total submissions, active days, average per active day, busiest day, monthly totals (daily detail when `days <= 60`) |
| `get_contests` | Recent contests with the problems solved in each, merged with rank and rating delta |
| `get_solved_problems` | Unique problem names with their contest, plus the profile's reported total |
| `compare_users` | Compact side-by-side profiles for 2–5 handles |

All tools take a `handle` (CodeChef username, e.g. `gennady.korotkevich`).

## Install

```sh
npx codechef-mcp
```

Or globally:

```sh
npm install -g codechef-mcp
```

## Wiring it into OpenCode (V2)

Config uses `mcp.servers`. Either run:

```sh
opencode mcp add codechef --global -- npx -y codechef-mcp
```

or add it by hand to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "codechef": {
        "type": "local",
        "command": ["npx", "-y", "codechef-mcp"]
      }
    }
  }
}
```

Then check it with `opencode mcp list`. Under Code Mode the tools appear as
`tools.codechef.get_profile(...)`.

## Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "codechef": {
      "command": "npx",
      "args": ["-y", "codechef-mcp"]
    }
  }
}
```

On Windows, if the client cannot find `npx`, use the shell form:

```json
{
  "mcpServers": {
    "codechef": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "codechef-mcp"]
    }
  }
}
```

## Run from source

```sh
git clone https://github.com/sarthaksec/codechef-mcp.git
cd codechef-mcp
npm install
npm start          # speaks MCP over stdio
```

Point your MCP client at `src/server.js` inside the clone, or call the scraper directly:

```sh
node test/smoke.js aryanc403
```

## Development

```sh
npm install
npm run test:unit  # offline parser + security tests
npm run test:live  # live CodeChef scraper checks
npm run test:mcp   # end-to-end MCP client handshake
npm test           # all three
```

`test:unit` is fully offline and runs in CI on Node 20, 22 and 24. The live suites
depend on CodeChef being reachable and are not run in CI.

## Releasing

Releases are published from GitHub Actions using **trusted publishing (OIDC)** — there is
no `NPM_TOKEN` secret and no long-lived npm credential.

```sh
npm version patch        # or minor / major
git push --follow-tags
```

Pushing the tag (for example `v0.1.1`) triggers `.github/workflows/publish.yml`, which:

1. checks that the tag matches `package.json`'s version,
2. installs with `npm ci` and runs the offline tests,
3. runs `npm publish` authenticated by a short-lived OIDC token,
4. publishes **provenance attestations automatically** (public package, public repo).

### One-time trusted publisher setup

On [npmjs.com](https://www.npmjs.com/package/codechef-mcp) → package **Settings** →
**Trusted publishing** → **Add trusted publisher** → GitHub Actions:

| Field | Value |
| --- | --- |
| Organization or user | `sarthaksec` |
| Repository | `codechef-mcp` |
| Workflow filename | `publish.yml` |
| Environment name | *(leave blank)* |
| Allowed actions | ✅ **Allow npm publish** (and optionally **Allow npm dist-tag**) |

Newer configurations default to *stage-only* publishing. If **Allow npm publish** is not
selected, the workflow's `npm publish` step is rejected; either enable it or change the
workflow to `npm stage publish` and approve each release manually with 2FA.

The first publish must succeed within **2 days** of creating the configuration, otherwise it
expires and has to be recreated.

### Verifying provenance

```sh
npm audit signatures
```

Or open the package on npmjs.com — a **Provenance** badge links the published tarball to the
exact commit and workflow run that built it.

## Behavior

- **Cache:** parsed pages are cached for 10 minutes per handle (max 200 entries).
- **Throttle:** at least 800 ms between outbound requests.
- **Retries:** up to 3 attempts with backoff on `403`, `429`, `5xx` and Cloudflare challenges.
- **Errors:** typed codes — `INVALID_HANDLE`, `USER_NOT_FOUND`, `BLOCKED`, `UNPARSEABLE`,
  `FETCH_FAILED` — returned with `isError: true` so the model can react instead of retrying blindly.
- **User-Agent:** identifies the client; requests are one profile page at a time.

## Security

- **Outbound HTTPS only, to `www.codechef.com`.** Responses redirected to any other host are rejected.
- **TLS verification** is on (Node's default `fetch`; no `rejectUnauthorized: false` anywhere).
- **Bounded resources:** 5 MB response cap (streamed, aborts mid-body), 25 s timeout, 3 retries,
  200-entry cache.
- **No `eval`, no `new Function`, no child processes, no filesystem or environment access.**
- **No credentials** are read, stored, or sent — requests are anonymous.
- **Handle whitelisting:** handles must match `^[A-Za-z0-9._-]{1,64}$` and are URL-encoded, so a
  handle cannot alter the request path.
- **Null-prototype maps** for page-derived keys, so a crafted label cannot touch `Object.prototype`.
- Publishing is limited by the `files` field: only `src/` + docs ship to npm.
- **Releases use OIDC trusted publishing**, not a long-lived npm token, and ship with provenance
  attestations from GitHub Actions.

## Caveats

- **Unofficial.** CodeChef's HTML is not a contract. If they change markup, `test/unit.js` and
  `test/smoke.js` will tell you which field broke.
- **Cloudflare.** CodeChef fronts the site with Cloudflare. A burst of requests can get a
  "Just a moment..." challenge; the server detects it and reports `BLOCKED` rather than
  returning garbage. Wait a minute and retry.
- **`robots.txt`.** `/users/*` is not disallowed, which is what this server reads. The
  `/rankings/*` leaderboard **is** disallowed, so global/country rank are taken from the profile
  page instead of scraping rankings.
- **Counts can differ.** `get_solved_problems.uniqueProblemsSolved` (from the per-contest list) can
  be lower than `reportedTotalSolved`, because the profile only lists problems for the contests it
  renders.
- No login-only data (submissions, code, unsolved problems) — that needs a session and is out of
  scope.

## Layout

```
src/server.js   MCP entry point (stdio)
src/tools.js    tool registration + schemas
src/api.js      derived data (deltas, summaries)
src/parse.js    HTML/embedded-JSON parsing
src/http.js     fetch, cache, throttle, retries
test/unit.js    offline parser tests
test/smoke.js   live scraper test
test/mcp.js     end-to-end MCP client handshake
```

## License

MIT © Sarthak Agnihotri ([sarthaksec](https://github.com/sarthaksec)).
Not affiliated with or endorsed by CodeChef.
