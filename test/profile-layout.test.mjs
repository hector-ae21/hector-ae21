import assert from "node:assert/strict";
import test from "node:test";

import { HeaderTable } from "../scripts/lib/pages/header.mjs";

test("renders the organization hierarchy directly below profile navigation", () => {
  const header = new HeaderTable({
    profile: {
      login: "hector-ae21",
      nav: {
        sections: [{ label: "Packages", to: "packages" }],
        organizations: {
          label: "Organizations",
          path: [
            { name: "Didactika", url: "https://github.com/didactika" },
            { name: "ResilientMQ", url: "https://github.com/resilientmq" },
          ],
        },
      },
      quickAccess: { rows: [], pinned: [] },
    },
    data: { recent: [] },
    links: {
      page: (id) => `https://example.com/${id}`,
      repo: (name) => `https://github.com/${name}`,
      inlinePicture: () => "",
    },
    log: { warn() {} },
  }).render("BANNER");

  assert.match(header, /Packages<\/a><\/sub><br><sub><strong>Organizations<\/strong>/);
  assert.match(header, /Didactika<\/a> \/ <a href="https:\/\/github\.com\/resilientmq">ResilientMQ<\/a>/);
  assert.doesNotMatch(header, /Founder/);
});
