import { CodeChefError } from "./errors.js";

const BASE = "https://www.codechef.com/users/";
const ALLOWED_HOST = "www.codechef.com";
const USER_AGENT =
  "codechef-mcp/0.1 (+https://github.com/sarthaksec/codechef-mcp)";
const CACHE_TTL_MS = 10 * 60 * 1000;
const MIN_INTERVAL_MS = 800;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

const cache = new Map();
let lastRequestAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

export function isValidHandle(handle) {
  return typeof handle === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(handle);
}

/**
 * Fetch a CodeChef user profile page, with caching, global throttling and
 * retries for transient/Cloudflare responses.
 */
export async function fetchUserPage(handle, { force = false } = {}) {
  if (!isValidHandle(handle)) {
    throw new CodeChefError(
      `Invalid CodeChef handle: ${JSON.stringify(handle)}`,
      { code: "INVALID_HANDLE" },
    );
  }

  const key = handle.toLowerCase();
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { html: cached.html, fromCache: true, url: cached.url };
  }

  const url = BASE + encodeURIComponent(handle);
  let lastErr;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await throttle();
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: "follow",
      });

      if (res.status === 404) {
        throw new CodeChefError(`CodeChef user "${handle}" not found (HTTP 404).`, {
          code: "USER_NOT_FOUND",
          status: 404,
        });
      }
      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        lastErr = new CodeChefError(
          `CodeChef responded with HTTP ${res.status}.`,
          { code: "UPSTREAM", status: res.status, retryable: true },
        );
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        throw new CodeChefError(`Unexpected HTTP ${res.status} from CodeChef.`, {
          code: "UPSTREAM",
          status: res.status,
        });
      }

      // Never follow a redirect off CodeChef (defends against an upstream
      // redirect being used to point the client at another host).
      if (new URL(res.url).hostname !== ALLOWED_HOST) {
        throw new CodeChefError(
          `Refusing response redirected to unexpected host: ${new URL(res.url).hostname}`,
          { code: "UNEXPECTED_REDIRECT" },
        );
      }

      const html = await readTextCapped(res, MAX_RESPONSE_BYTES);

      if (isCloudflareChallenge(html)) {
        lastErr = new CodeChefError(
          "CodeChef's Cloudflare protection served a bot challenge instead of the profile. " +
            "Wait a minute and retry, or lower the request rate.",
          { code: "BLOCKED", retryable: true },
        );
        await sleep(1500 * 2 ** attempt);
        continue;
      }

      if (isNotFoundPage(html)) {
        throw new CodeChefError(`CodeChef user "${handle}" does not exist.`, {
          code: "USER_NOT_FOUND",
          status: 404,
        });
      }

      if (!looksLikeProfile(html)) {
        throw new CodeChefError(
          "CodeChef returned a page without profile data (possible markup change or outage).",
          { code: "UNPARSEABLE", retryable: true },
        );
      }

      cache.set(key, { html, at: Date.now(), url });
      pruneCache();
      return { html, fromCache: false, url };
    } catch (err) {
      if (err instanceof CodeChefError && !err.retryable) throw err;
      lastErr = err;
      await sleep(500 * 2 ** attempt);
    }
  }

  if (lastErr instanceof CodeChefError && lastErr.code === "BLOCKED") {
    throw lastErr;
  }

  throw new CodeChefError(
    `Could not fetch CodeChef profile for "${handle}" after ${MAX_RETRIES} attempts: ${
      lastErr?.message ?? "unknown error"
    }`,
    { code: "FETCH_FAILED", retryable: true },
  );
}

export async function readTextCapped(res, maxBytes) {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    throw new CodeChefError(`Response too large (${declared} bytes).`, {
      code: "RESPONSE_TOO_LARGE",
    });
  }
  if (!res.body) return res.text();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new CodeChefError(
          `Response exceeded ${maxBytes} bytes; aborted to protect memory.`,
          { code: "RESPONSE_TOO_LARGE" },
        );
      }
      out += decoder.decode(value, { stream: true });
    }
    out += decoder.decode();
    return out;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

function looksLikeProfile(html) {
  return (
    typeof html === "string" &&
    (html.includes('class="user-details"') || html.includes("h2-style")) &&
    html.includes("all_rating")
  );
}

function isCloudflareChallenge(html) {
  return (
    typeof html === "string" &&
    (html.includes("_cf_chl_opt") ||
      html.includes("Just a moment...") ||
      html.includes("Enable JavaScript and cookies to continue"))
  );
}

export function isNotFoundPage(html) {
  if (typeof html !== "string") return false;
  if (looksLikeProfile(html)) return false;
  if (/does not exist|user not found|no such user|invalid user/i.test(html)) {
    return true;
  }
  // Unknown handles soft-404 to the generic CodeChef home shell with HTTP 200.
  return (
    /<title>\s*CodeChef\s*-\s*Learn and Practice Coding with Problems\s*<\/title>/i.test(html) ||
    /property="og:url"\s+content="https:\/\/www\.codechef\.com\/"/i.test(html)
  );
}

export { isCloudflareChallenge };

function pruneCache() {
  if (cache.size <= 200) return;
  const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [k] of oldest.slice(0, cache.size - 200)) cache.delete(k);
}

export function clearCache() {
  cache.clear();
}
