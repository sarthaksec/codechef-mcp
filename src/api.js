import { fetchUserPage } from "./http.js";
import { parseUserPage } from "./parse.js";

async function load(handle, opts) {
  const { html, fromCache, url } = await fetchUserPage(handle, opts);
  const data = parseUserPage(html, handle);
  return { data, meta: { profileUrl: url, fromCache } };
}

function sortedHistory(history) {
  return [...history]
    .filter((h) => h.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function withDeltas(history) {
  const sorted = sortedHistory(history);
  return sorted.map((entry, i) => ({
    ...entry,
    ratingChange: i === 0 || entry.rating == null || sorted[i - 1].rating == null
      ? null
      : entry.rating - sorted[i - 1].rating,
  }));
}

export async function getProfile(handle) {
  const { data, meta } = await load(handle);
  const history = withDeltas(data.ratingHistory);

  const latest = history.at(-1) ?? null;
  const best = history.reduce(
    (acc, h) => (h.rating != null && (!acc || h.rating > acc.rating) ? h : acc),
    null,
  );

  return {
    username: data.username,
    name: data.name,
    stars: data.stars,
    country: data.country,
    countryCode: data.countryCode,
    role: data.role,
    organisation: data.organisation,
    rating: data.rating,
    problemsSolved: data.problemsSolved,
    contestsParticipated: history.length,
    latestContest: latest
      ? {
          contest: latest.contest,
          date: latest.date,
          rating: latest.rating,
          ratingChange: latest.ratingChange,
          rank: latest.rank,
        }
      : null,
    bestRating: best
      ? { rating: best.rating, contest: best.contest, date: best.date }
      : null,
    recentForm: history.slice(-5).map((h) => ({
      date: h.date,
      rating: h.rating,
      ratingChange: h.ratingChange,
      rank: h.rank,
    })),
    profileUrl: meta.profileUrl,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getRatingHistory(handle, { limit = 20 } = {}) {
  const { data, meta } = await load(handle);
  const history = withDeltas(data.ratingHistory);
  const recent = history.slice(-limit).reverse();

  return {
    username: data.username,
    totalContests: history.length,
    currentRating: data.rating.current,
    highestRating: data.rating.highest,
    contests: recent.map((h) => ({
      contest: h.contest,
      code: h.code,
      date: h.date,
      rating: h.rating,
      ratingChange: h.ratingChange,
      rank: h.rank,
    })),
    profileUrl: meta.profileUrl,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getActivity(handle, { days = 90 } = {}) {
  const { data, meta } = await load(handle);
  const cutoff = new Date(Date.now() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const window = data.heatmap
    .filter((d) => d.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalSubmissions = window.reduce((s, d) => s + d.submissions, 0);
  const activeDays = window.filter((d) => d.submissions > 0).length;
  const busiest = window.reduce(
    (acc, d) => (d.submissions > (acc?.submissions ?? 0) ? d : acc),
    null,
  );

  const byMonth = {};
  for (const d of window) {
    const month = d.date.slice(0, 7);
    byMonth[month] = (byMonth[month] ?? 0) + d.submissions;
  }

  return {
    username: data.username,
    windowDays: days,
    since: cutoff,
    totalSubmissions,
    activeDays,
    avgSubmissionsPerActiveDay: activeDays
      ? Number((totalSubmissions / activeDays).toFixed(1))
      : 0,
    busiestDay: busiest,
    byMonth,
    daily: days <= 60 ? window : undefined,
    profileUrl: meta.profileUrl,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getContests(handle, { limit = 10 } = {}) {
  const { data, meta } = await load(handle);
  const byName = new Map(
    withDeltas(data.ratingHistory).map((h) => [h.contest, h]),
  );

  const contests = [...data.contests]
    .reverse()
    .slice(0, limit)
    .map((c) => {
      const rating = byName.get(c.contest);
      return {
        contest: c.contest,
        problemsSolved: c.problemsSolved,
        problems: c.problems,
        date: rating?.date ?? null,
        rank: rating?.rank ?? null,
        ratingAfter: rating?.rating ?? null,
        ratingChange: rating?.ratingChange ?? null,
      };
    });

  return {
    username: data.username,
    totalContestsWithSolutions: data.contests.length,
    contests,
    profileUrl: meta.profileUrl,
    fetchedAt: new Date().toISOString(),
  };
}

export async function getSolvedProblems(handle, { limit = 200 } = {}) {
  const { data, meta } = await load(handle);
  const seen = new Map();

  for (const c of data.contests) {
    for (const p of c.problems) {
      if (!seen.has(p)) seen.set(p, c.contest);
    }
  }

  const all = [...seen.entries()].map(([problem, contest]) => ({ problem, contest }));

  return {
    username: data.username,
    uniqueProblemsSolved: all.length,
    reportedTotalSolved: data.problemsSolved,
    returned: Math.min(limit, all.length),
    problems: all.slice(0, limit),
    profileUrl: meta.profileUrl,
    fetchedAt: new Date().toISOString(),
  };
}

export async function compareUsers(handles) {
  const results = [];
  for (const handle of handles) {
    try {
      const p = await getProfile(handle);
      results.push({
        username: p.username,
        name: p.name,
        stars: p.stars,
        country: p.country,
        rating: p.rating,
        problemsSolved: p.problemsSolved,
        contestsParticipated: p.contestsParticipated,
        bestRating: p.bestRating?.rating ?? null,
      });
    } catch (err) {
      results.push({ username: handle, error: err.message });
    }
  }
  return {
    users: results,
    fetchedAt: new Date().toISOString(),
  };
}
