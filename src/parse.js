import * as cheerio from "cheerio";

const clean = (s = "") =>
  s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const num = (v) => {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * Extract a JS array literal that follows `marker`, e.g.
 *   var all_rating = [ ... ];
 * Uses bracket matching so nested objects/strings don't break it.
 */
export function extractJsonArray(source, marker) {
  const at = source.indexOf(marker);
  if (at === -1) return null;
  const start = source.indexOf("[", at);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function safeParseArray(source, marker) {
  const raw = extractJsonArray(source, marker);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeDate(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value).trim());
  if (!m) return null;
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}

export function parseUserPage(html, handle) {
  const $ = cheerio.load(html);

  const name = clean($("h1.h2-style").first().text()) || null;
  const username = clean($(".m-username--link").first().text()) || handle;

  // Sidebar: Username / Country / Student-Professional / Organisation / Pro Plan
  const sidebar = {};
  $(".user-details li").each((_, li) => {
    const $li = $(li);
    const label = clean($li.find("label").first().text())
      .replace(/:$/, "")
      .toLowerCase();
    if (!label) return;
    const clone = $li.clone();
    clone.find("label").remove();
    clone.find("a").remove();
    const value = clean(clone.text()).replace(/View Details$/i, "").trim();
    if (value) sidebar[label] = value;
  });

  const starsText = clean($(".user-details .rating").first().text());
  const stars = num(/(\d+)/.exec(starsText)?.[1]);
  const starCount = $("#rating-block-all .rating-star span").length || null;

  const block = $("#rating-block-all");
  const ratingText = clean(block.find(".rating-number").first().text());
  const currentRating = /^\d+$/.test(ratingText) ? Number(ratingText) : null;

  const headerText = clean(block.find(".rating-header").first().text());
  const division = /\(Div\s*(\d+)\)/i.exec(headerText)?.[1] ?? null;
  const highestRating = num(/(\d+)/.exec(clean(block.find("small").first().text()))?.[1]);

  const ranks = {};
  block.find(".rating-ranks li").each((_, li) => {
    const $li = $(li);
    const value = clean($li.find("strong").first().text());
    const label = clean($li.text()).replace(value, "").trim().toLowerCase();
    const key = label.includes("global")
      ? "global"
      : label.includes("country")
        ? "country"
        : label || "unknown";
    ranks[key] = /^\d+$/.test(value) ? Number(value) : value || null;
  });

  let problemsSolved = null;
  $("h3").each((_, h) => {
    const m = /Total Problems Solved:\s*([\d,]+)/i.exec(clean($(h).text()));
    if (m) problemsSolved = Number(m[1].replace(/,/g, ""));
  });

  const contests = [];
  $(".problems-solved .content").each((_, el) => {
    const contest = clean($(el).find("h5").first().text());
    const problems = clean($(el).find("p").first().text())
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (contest) contests.push({ contest, problemsSolved: problems.length, problems });
  });

  const ratingHistory = safeParseArray(html, "var all_rating")
    .map((r) => ({
      code: r.code ?? null,
      contest: clean(r.name) || null,
      date: normalizeDate(r.end_date) ?? normalizeDate(`${r.getyear}-${r.getmonth}-${r.getday}`),
      rating: num(r.rating),
      rank: num(r.rank),
      reason: r.reason ?? null,
    }))
    .filter((r) => r.date || r.rating != null);

  const heatmap = safeParseArray(html, "userDailySubmissionsStats")
    .map((d) => ({ date: normalizeDate(d.date), submissions: num(d.value) ?? 0 }))
    .filter((d) => d.date);

  return {
    username,
    name,
    stars: stars ?? starCount,
    country: clean($(".user-country-name").first().text()) || null,
    countryCode: $("img.user-country-flag").first().attr("title") || null,
    role: sidebar["student/professional"] ?? null,
    organisation: sidebar["organisation"] ?? sidebar["institution"] ?? null,
    rating: {
      current: currentRating,
      highest: highestRating,
      division: division ? Number(division) : null,
      globalRank: ranks.global ?? null,
      countryRank: ranks.country ?? null,
    },
    problemsSolved,
    contests,
    ratingHistory,
    heatmap,
  };
}
