import assert from "node:assert/strict";
import test from "node:test";

import { ProfileCollector } from "../scripts/lib/sources/collector.mjs";

const LOGIN = "hector-ae21";

function repository(fullName, pushedAt) {
  const [owner, name] = fullName.split("/");
  return {
    name,
    full_name: fullName,
    private: false,
    fork: false,
    pushed_at: pushedAt,
    owner: { login: owner },
  };
}

test("discovers every public repository with attributed commits", async () => {
  const own = repository(`${LOGIN}/http-response-client`, "2026-07-01T00:00:00Z");
  const contributed = repository("didactika/prisma-entity", "2026-08-01T00:00:00Z");
  const generatedProfile = repository(`${LOGIN}/${LOGIN}`, "2026-08-12T00:00:00Z");
  const calls = [];

  const github = {
    async get(path) {
      calls.push(path);
      if (path.startsWith("/search/commits?")) {
        return {
          total_count: 140,
          items: [
            { repository: own },
            { repository: contributed },
            { repository: contributed },
            { repository: generatedProfile },
          ],
        };
      }
      if (path === `/repos/${own.full_name}`) return own;
      if (path === `/repos/${contributed.full_name}`) return contributed;
      if (path === `/repos/${generatedProfile.full_name}`) return generatedProfile;
      if (path === `/repos/${own.full_name}/stats/contributors`) {
        return [{ author: { login: LOGIN }, total: 20, weeks: [] }];
      }
      if (path === `/repos/${contributed.full_name}/stats/contributors`) {
        return [{ author: { login: LOGIN }, total: 120, weeks: [] }];
      }
      if (path === `/repos/${generatedProfile.full_name}/stats/contributors`) return [];
      if (path.endsWith("/languages")) return { TypeScript: 1000 };
      if (path.startsWith("/search/issues?")) return { total_count: 7 };
      throw new Error(`Unexpected GitHub request: ${path}`);
    },
  };

  const collector = new ProfileCollector({
    github,
    npm: {},
    log: { step() {}, detail() {}, warn() {} },
  });
  const data = await collector.collect({
    login: LOGIN,
    projects: [],
    quickAccess: { pinned: [], exclude: [], recentCount: 5 },
  });

  assert.equal(data.repos.length, 2, "duplicates and repositories with no attributed commits are dropped");
  assert.ok(!data.repos.some((repo) => repo.full_name === generatedProfile.full_name));
  assert.equal(data.commitsTotal, 140);
  assert.deepEqual(data.perRepo, [
    { name: "didactika/prisma-entity", value: 120 },
    { name: "http-response-client", value: 20 },
  ]);
  assert.ok(
    calls.some((path) => path.includes("q=author%3Ahector-ae21%20is%3Apublic")),
    "repository discovery must use the authenticated user's public commits",
  );
});
