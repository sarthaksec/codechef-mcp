import { z } from "zod";
import {
  compareUsers,
  getActivity,
  getContests,
  getProfile,
  getRatingHistory,
  getSolvedProblems,
} from "./api.js";

const handleSchema = z
  .string()
  .min(1)
  .max(64)
  .describe("CodeChef username/handle, e.g. 'gennady.korotkevich'");

const json = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const fail = (err) => ({
  isError: true,
  content: [
    {
      type: "text",
      text: `CodeChef MCP error (${err.code ?? "ERROR"}): ${err.message}`,
    },
  ],
});

const wrap = (fn) => async (args) => {
  try {
    return json(await fn(args));
  } catch (err) {
    return fail(err);
  }
};

export function registerTools(server) {
  server.registerTool(
    "get_profile",
    {
      title: "Get CodeChef profile",
      description:
        "Fetch a CodeChef user's profile as compact structured JSON: name, star rating, " +
        "current and highest rating, division, global rank, country rank, problems solved, " +
        "contests participated, latest contest and recent form. Prefer this over downloading " +
        "and parsing the profile HTML page.",
      inputSchema: { handle: handleSchema },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    wrap(({ handle }) => getProfile(handle)),
  );

  server.registerTool(
    "get_rating_history",
    {
      title: "Get CodeChef rating history",
      description:
        "Return a user's contest rating history (newest first) with rating after each contest, " +
        "rating change (delta) and rank. Useful for trends, streaks and 'how has X improved' questions.",
      inputSchema: {
        handle: handleSchema,
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("How many recent contests to return (default 20)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    wrap(({ handle, limit }) => getRatingHistory(handle, { limit: limit ?? 20 })),
  );

  server.registerTool(
    "get_activity",
    {
      title: "Get CodeChef submission activity",
      description:
        "Summarize a user's submission heat map over a time window: total submissions, active days, " +
        "average per active day, busiest day and monthly totals. Answers 'how active is X' without " +
        "loading the heat map image or HTML.",
      inputSchema: {
        handle: handleSchema,
        days: z
          .number()
          .int()
          .min(7)
          .max(3650)
          .optional()
          .describe("Look-back window in days (default 90). Daily breakdown included only when <= 60."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    wrap(({ handle, days }) => getActivity(handle, { days: days ?? 90 })),
  );

  server.registerTool(
    "get_contests",
    {
      title: "Get CodeChef contest results",
      description:
        "List a user's contests (newest first) with the problems solved in each, plus rank and rating change " +
        "where available. Use this for 'what has X solved recently' or per-contest performance.",
      inputSchema: {
        handle: handleSchema,
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("How many recent contests to return (default 10)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    wrap(({ handle, limit }) => getContests(handle, { limit: limit ?? 10 })),
  );

  server.registerTool(
    "get_solved_problems",
    {
      title: "Get CodeChef solved problems",
      description:
        "Return the unique problem names a user has solved (as listed on their profile), with the contest " +
        "each came from, plus their reported total solved count. Capped by 'limit' to protect context size.",
      inputSchema: {
        handle: handleSchema,
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("Maximum number of problem names to return (default 200)."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    wrap(({ handle, limit }) => getSolvedProblems(handle, { limit: limit ?? 200 })),
  );

  server.registerTool(
    "compare_users",
    {
      title: "Compare CodeChef users",
      description:
        "Fetch compact side-by-side profiles for 2-5 CodeChef handles: rating, stars, ranks, problems solved " +
        "and contest count. Handy for 'who is better' or team-selection questions.",
      inputSchema: {
        handles: z
          .array(z.string().min(1).max(64))
          .min(2)
          .max(5)
          .describe("Two to five CodeChef handles to compare."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    wrap(({ handles }) => compareUsers(handles)),
  );
}
