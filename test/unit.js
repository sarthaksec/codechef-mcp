import { parseUserPage, extractJsonArray } from "../src/parse.js";
import { isNotFoundPage, isCloudflareChallenge } from "../src/http.js";

let pass = 0;
let fail = 0;
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
};

// --- bracket matcher handles brackets inside strings ---
eq(
  "extractJsonArray tolerates ']' in strings",
  JSON.parse(extractJsonArray('x = [{"a":"]"},{"b":2}];', "x =")),
  [{ a: "]" }, { b: 2 }],
);

// --- full page parse ---
const html = `
<h1 class="h2-style">Test User</h1>
<section class="user-details"><ul>
  <li><label>Username:</label><span><span class='rating'>5&#9733;</span><span class='m-username--link'>testuser</span></span></li>
  <li><label>Country:</label><span><img class="user-country-flag" title="IN"><span class="user-country-name">India</span></span></li>
  <li><label>Organisation:</label><span>IIT Test</span></li>
</ul></section>
<div id="rating-block-all">
  <div class="rating-header"><div class="rating-number">1800</div><div>(Div 3)</div><small>(Highest Rating 1900)</small></div>
  <div class="rating-ranks"><ul>
    <li><a href="/ratings/all"><strong>1234</strong></a>Global Rank</li>
    <li><a href="/ratings/all?x"><strong>56</strong></a>Country Rank</li>
  </ul></div>
</div>
<h3>Total Problems Solved: 120</h3>
<section class="rating-data-section problems-solved">
  <div class='content'><h5><span>Contest A</span></h5><p><span>P1</span>,&nbsp;<span>P2</span></p></div>
</section>
<script>var all_rating = [{"code":"A","name":"Contest A","end_date":"2024-01-15 12:00:00","rating":"1700","rank":"10"}];</script>
<script>userDailySubmissionsStats = [{"date":"2024-1-2","value":3},{"date":"2024-01-03","value":5}];</script>
`;

const p = parseUserPage(html, "testuser");
eq("name", p.name, "Test User");
eq("username", p.username, "testuser");
eq("stars", p.stars, 5);
eq("country", p.country, "India");
eq("countryCode", p.countryCode, "IN");
eq("organisation", p.organisation, "IIT Test");
eq("current rating", p.rating.current, 1800);
eq("highest rating", p.rating.highest, 1900);
eq("division", p.rating.division, 3);
eq("global rank", p.rating.globalRank, 1234);
eq("country rank", p.rating.countryRank, 56);
eq("problems solved", p.problemsSolved, 120);
eq("contest name", p.contests[0].contest, "Contest A");
eq("contest problems", p.contests[0].problems, ["P1", "P2"]);
eq("history date normalized", p.ratingHistory[0].date, "2024-01-15");
eq("history rating numeric", p.ratingHistory[0].rating, 1700);
eq("heatmap date normalized", p.heatmap[0].date, "2024-01-02");
eq("heatmap value", p.heatmap[1].submissions, 5);

// --- detection helpers ---
eq("cloudflare challenge detected", isCloudflareChallenge("<html>Just a moment...</html>"), true);
eq("normal page is not a challenge", isCloudflareChallenge("<html>hi</html>"), false);
eq("not-found detected", isNotFoundPage("<p>The user does not exist.</p>"), true);
eq(
  "soft-404 homepage detected",
  isNotFoundPage('<title>CodeChef - Learn and Practice Coding with Problems</title>'),
  true,
);
eq("profile page is not 'not found'", isNotFoundPage(html), false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
