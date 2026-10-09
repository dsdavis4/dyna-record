import {
  ConditionalCheckFailedError,
  WriteConditionFailedError,
  type WriteConditionGuard
} from "../../src/dynamo-utils/index.js";
import Logger from "../../src/Logger.js";

describe("errors", () => {
  describe("ConditionalCheckFailedError", () => {
    it("has a 'ConditionalCheckFailedError' code", () => {
      expect.assertions(1);

      expect(new ConditionalCheckFailedError("some error").code).toEqual(
        "ConditionalCheckFailedError"
      );
    });
  });

  describe("WriteConditionFailedError", () => {
    const error = new WriteConditionFailedError("some error", {
      entity: "Order",
      id: "o1",
      guards: [
        { kind: "self" },
        { kind: "relationship", name: "orders", id: "o2" }
      ]
    });

    it("is a ConditionalCheckFailedError", () => {
      expect.assertions(1);

      expect(error).toBeInstanceOf(ConditionalCheckFailedError);
    });

    it("has a 'WriteConditionFailedError' code", () => {
      expect.assertions(1);

      expect(error.code).toEqual("WriteConditionFailedError");
    });

    it("names the write and every consumer guard on the failed row", () => {
      expect.assertions(4);

      expect(error.message).toEqual("some error");
      expect(error.entity).toEqual("Order");
      expect(error.id).toEqual("o1");
      expect(error.guards).toEqual([
        { kind: "self" },
        { kind: "relationship", name: "orders", id: "o2" }
      ]);
    });

    describe("types", () => {
      const failure = (guard: WriteConditionGuard): WriteConditionFailedError =>
        new WriteConditionFailedError("some error", {
          entity: "Order",
          id: "o1",
          guards: [guard]
        });

      it("names the written entity's own row with no name or id", () => {
        // @ts-expect-no-error: the own-row guard is named by its kind alone
        Logger.log(failure({ kind: "self" }));
        // @ts-expect-error: the own-row guard carries no name
        Logger.log(failure({ kind: "self", name: "order" }));
      });

      it("names a relationship, with the related id optional", () => {
        // @ts-expect-no-error: a BelongsTo or HasOne guard is named by the relationship alone
        Logger.log(failure({ kind: "relationship", name: "customer" }));
        // @ts-expect-no-error: a HasMany or HasAndBelongsToMany entry also names the related id
        Logger.log(failure({ kind: "relationship", name: "orders", id: "o2" }));
      });

      it("names a foreign key without an id", () => {
        // @ts-expect-no-error: a target guard is named by its foreign key
        Logger.log(failure({ kind: "foreignKey", name: "storeId" }));
        // @ts-expect-error: a target guard carries no id, since the referenced id is the foreign key's value
        Logger.log(failure({ kind: "foreignKey", name: "storeId", id: "s1" }));
      });

      it("reads the id only after narrowing to a relationship", () => {
        const [guard] = failure({ kind: "foreignKey", name: "storeId" }).guards;

        // @ts-expect-error: id is not a property of every guard
        Logger.log(guard.id);

        if (guard.kind === "relationship") {
          // @ts-expect-no-error: a relationship guard may carry the related id
          Logger.log(guard.id);
        }
      });
    });
  });
});
