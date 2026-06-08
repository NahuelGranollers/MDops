import { describe, expect, it } from "vitest";
import { isAdmin } from "../auth/rbac.js";

describe("RBAC", () => {
  it("reconoce admin por rol, no por nombre hardcodeado", () => {
    expect(isAdmin({ id: "1", tenantId: "t", email: "a@b.c", name: "Albert", roles: ["admin"], permissions: [] })).toBe(true);
    expect(isAdmin({ id: "2", tenantId: "t", email: "n@b.c", name: "Nahuel", roles: ["technician"], permissions: [] })).toBe(false);
  });
});
