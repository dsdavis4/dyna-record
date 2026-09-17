/**
 * Unit tests for update-expression assembly.
 *
 * `renderUpdateExpression` is the seam introduced so vector clauses are
 * appended as fragments rather than spliced into an already-rendered string.
 * Update.test.ts covers it end to end through `Entity.update(...)`; these
 * pin the assembly rules directly, including the empty-clause boundaries a
 * full update rarely reaches.
 */
import { renderUpdateExpression } from "../../src/operations/utils/index.js";

describe("renderUpdateExpression", () => {
  it("renders both actions, SET always before REMOVE", () => {
    expect.assertions(1);

    expect(
      renderUpdateExpression({
        set: ["#Name = :Name", "#UpdatedAt = :UpdatedAt"],
        remove: ["#Nickname"]
      })
    ).toBe("SET #Name = :Name, #UpdatedAt = :UpdatedAt REMOVE #Nickname");
  });

  it("omits REMOVE entirely when nothing is removed", () => {
    expect.assertions(1);

    expect(renderUpdateExpression({ set: ["#Name = :Name"], remove: [] })).toBe(
      "SET #Name = :Name"
    );
  });

  it("omits SET entirely when nothing is set", () => {
    expect.assertions(1);

    // The shape a clear-only update produces: a searchable value set to null
    // removes the attribute and its vector, setting nothing
    expect(
      renderUpdateExpression({
        set: [],
        remove: ["#Description", "#__dyna_vector"]
      })
    ).toBe("REMOVE #Description, #__dyna_vector");
  });

  it("renders an empty expression when both actions are empty", () => {
    expect.assertions(1);

    expect(renderUpdateExpression({ set: [], remove: [] })).toBe("");
  });

  it("renders a single fragment without a trailing separator", () => {
    expect.assertions(2);

    expect(renderUpdateExpression({ set: ["#A = :A"], remove: [] })).toBe(
      "SET #A = :A"
    );
    expect(renderUpdateExpression({ set: [], remove: ["#A"] })).toBe(
      "REMOVE #A"
    );
  });

  it("preserves fragment order within each action", () => {
    expect.assertions(1);

    expect(
      renderUpdateExpression({
        set: ["#C = :C", "#A = :A", "#B = :B"],
        remove: ["#Z", "#Y"]
      })
    ).toBe("SET #C = :C, #A = :A, #B = :B REMOVE #Z, #Y");
  });

  it("does not mutate the clauses it renders", () => {
    expect.assertions(2);

    const clauses = { set: ["#A = :A"], remove: ["#B"] };
    renderUpdateExpression(clauses);

    expect(clauses.set).toEqual(["#A = :A"]);
    expect(clauses.remove).toEqual(["#B"]);
  });

  it("appending a vector fragment re-renders without string surgery", () => {
    expect.assertions(2);

    // The finding-7 shape: a REMOVE clause already exists, and the vector SET
    // is appended as a fragment. Previously this required splicing the
    // rendered string around a /(?:^| )REMOVE #/ match.
    const clauses = { set: ["#Name = :Name"], remove: ["#Nickname"] };
    expect(renderUpdateExpression(clauses)).toBe(
      "SET #Name = :Name REMOVE #Nickname"
    );

    clauses.set.push("#__dyna_vector = :__dyna_vector");
    clauses.remove.push("#__dyna_vector_support");

    expect(renderUpdateExpression(clauses)).toBe(
      "SET #Name = :Name, #__dyna_vector = :__dyna_vector REMOVE #Nickname, #__dyna_vector_support"
    );
  });
});
