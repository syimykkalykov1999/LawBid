// node --test scripts/dev/lint-staged-config.test.mjs
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import config, {
  SORTED_LISTS,
  apiTypeScriptTasks,
} from "../../lint-staged.config.mjs";

const abs = (p) => `/repo/${p}`;

describe("lint-staged config", () => {
  it("lints staged API files and does nothing else for ordinary code", () => {
    const tasks = apiTypeScriptTasks([abs("apps/api/src/common/util.ts")]);
    assert.equal(tasks.length, 1);
    assert.match(tasks[0], /eslint --fix/);
  });

  it("a staged DTO or controller regenerates the contract after eslint and stages it", () => {
    for (const f of [
      "apps/api/src/modules/cases/dto/create-case.dto.ts",
      "apps/api/src/modules/cases/cases.controller.ts",
    ]) {
      const tasks = apiTypeScriptTasks([abs(f)]);
      const eslint = tasks.findIndex((t) => t.includes("eslint"));
      const gen = tasks.findIndex((t) => t.includes("contract:fast"));
      const add = tasks.findIndex((t) =>
        t.startsWith(
          "git add packages/api-contract/openapi.json packages/api-contract/dart/lib",
        ),
      );
      assert.ok(eslint === 0 && gen > eslint && add > gen, tasks.join(" | "));
    }
  });

  it("a service file does not regenerate the contract", () => {
    const tasks = apiTypeScriptTasks([
      abs("apps/api/src/modules/cases/cases.service.ts"),
    ]);
    assert.ok(!tasks.some((t) => t.includes("contract:fast")));
  });

  it("a file under modules/ refreshes the architecture baseline and stages it", () => {
    const tasks = apiTypeScriptTasks([
      abs("apps/api/src/modules/cases/cases.service.ts"),
    ]);
    assert.ok(tasks.some((t) => t.includes("arch:baseline")));
    assert.ok(
      tasks.some((t) =>
        t.startsWith(
          "git add apps/api/src/architecture/module-boundaries.baseline.json",
        ),
      ),
    );
  });

  it("the sorted lists run lists:sort, and every list is a repo-relative path", () => {
    const globs = Object.keys(config).filter((k) => k.startsWith("{"));
    assert.equal(globs.length, 1);
    for (const f of SORTED_LISTS) {
      assert.ok(globs[0].includes(f));
      assert.ok(!f.startsWith("/"));
    }
    assert.equal(config[globs[0]](), "npm run lists:sort --workspace apps/api");
  });
});
