import type { DynamoNativeValue } from "../../src/types.js";
import Metadata from "../../src/metadata/index.js";
import { z } from "zod";
vi.mock("../../src/metadata");

describe("Attribute metadata", () => {
  describe("types", () => {
    describe("addEntityAttribute", () => {
      it("does not require the serializer property", () => {
        // @ts-expect-no-error: serializers is optional
        Metadata.addEntityAttribute("SomeEntityName", {
          attributeName: "attributeName",
          kind: "string",
          alias: "alias",
          nullable: true,
          type: z.any()
        });
      });

      it("if serializers is present then it requires both serializer functions", () => {
        Metadata.addEntityAttribute("SomeEntityName", {
          attributeName: "attributeName",
          alias: "alias",
          nullable: true,
          // @ts-expect-error: Missing toTableAttribute
          serializers: {
            toEntityAttribute: (val: DynamoNativeValue) => val
          }
        });

        Metadata.addEntityAttribute("SomeEntityName", {
          attributeName: "attributeName",
          alias: "alias",
          nullable: true,
          // @ts-expect-error: Missing toEntityAttribute
          serializers: {
            toTableAttribute: (val: any) => val
          }
        });

        Metadata.addEntityAttribute("SomeEntityName", {
          attributeName: "attributeName",
          kind: "string",
          alias: "alias",
          nullable: true,
          type: z.any(),
          // @ts-expect-no-error: Both serializer functions are defined
          serializers: {
            toEntityAttribute: (val: DynamoNativeValue) => val,
            toTableAttribute: (val: any) => val
          }
        });
      });
    });
  });
});
