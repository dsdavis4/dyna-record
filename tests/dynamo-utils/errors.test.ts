import {
  ConditionalCheckFailedError,
  WriteConditionFailedError
} from "../../src/dynamo-utils/index.js";

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
  });
});
