import {
  compareUsers,
  getActivity,
  getContests,
  getProfile,
  getRatingHistory,
  getSolvedProblems,
} from "../src/api.js";

const handle = process.argv[2] ?? "gennady.korotkevich";

const checks = [];
const check = (label, ok, extra = "") => {
  checks.push({ label, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
};

const profile = await getProfile(handle);
console.log("\n--- profile ---");
console.log(JSON.stringify(profile, null, 2));

check("has username", profile.username?.toLowerCase() === handle.toLowerCase());
check("has rating", typeof profile.rating.current === "number");
check("has problemsSolved", typeof profile.problemsSolved === "number");
check("has contest count", profile.contestsParticipated >= 0);

const history = await getRatingHistory(handle, { limit: 5 });
console.log("\n--- rating history (5) ---");
console.log(JSON.stringify(history, null, 2));
check("history returned", history.contests.length > 0);
check("history newest first", history.contests[0].date >= history.contests.at(-1).date);

const activity = await getActivity(handle, { days: 90 });
console.log("\n--- activity (90d) ---");
console.log(JSON.stringify(activity, null, 2));
check("activity has totals", typeof activity.totalSubmissions === "number");

const contests = await getContests(handle, { limit: 3 });
console.log("\n--- contests (3) ---");
console.log(JSON.stringify(contests, null, 2));

const solved = await getSolvedProblems(handle, { limit: 5 });
console.log("\n--- solved (5) ---");
console.log(JSON.stringify(solved, null, 2));

const cmp = await compareUsers([handle, "aryanc403"]);
check("compare returns 2", cmp.users.length === 2);
check("compare no errors", cmp.users.every((u) => !u.error));

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
