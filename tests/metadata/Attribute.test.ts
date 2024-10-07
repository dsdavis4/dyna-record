import type { NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";
import Metadata from "../../src/metadata";
import { z } from "zod";
jest.mock("../../src/metadata");

describe("Attribute metadata", () => {
  describe("types", () => {
    describe("addEntityAttribute", () => {
      it("does not require the serializer property", () => {
        // @ts-expect-no-error: serializers is optional
        Metadata.addEntityAttribute("SomeEntityName", {
          attributeName: "attributeName",
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
            toEntityAttribute: (val: NativeScalarAttributeValue) => val
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
          alias: "alias",
          nullable: true,
          type: z.any(),
          // @ts-expect-no-error: Both serializer functions are defined
          serializers: {
            toEntityAttribute: (val: NativeScalarAttributeValue) => val,
            toTableAttribute: (val: any) => val
          }
        });
      });
    });
  });
});
