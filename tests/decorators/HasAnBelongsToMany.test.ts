import { Entity, Attribute, HasAndBelongsToMany } from "../../src/decorators";
import { MockTable } from "../integration/mockModels";

describe("HasAndBelongsToMany", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("types", () => {
    it("will allow relationships where the targetKey references an attribute on the related model is an Array of the models type", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-no-error: targetKey 'modelOnes' exists on ModelTwo as type of ModelOne[]
        @HasAndBelongsToMany(() => ModelTwo, { targetKey: "modelOnes" })
        // @ts-expect-no-error: Is array of associated model
        public modelTwos: ModelTwo[];
      }

      @Entity
      class ModelTwo extends MockTable {
        // @ts-expect-no-error: targetKey 'modelTwos' exists on ModelOne as type of ModelTwo[]
        @HasAndBelongsToMany(() => ModelOne, { targetKey: "modelTwos" })
        // @ts-expect-no-error: Is array of associated model
        public modelOnes: ModelOne[];
      }
    });

    it("attribute - will error if the targetKey that is referenced is not an Array of the related type", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: targetKey on ModelTwo is not an array of ModelOne
        @HasAndBelongsToMany(() => ModelTwo, { targetKey: "someVal" })
        // @ts-expect-no-error: Is array of associated model
        public modelTwos: ModelTwo[];
      }

      @Entity
      class ModelTwo extends MockTable {
        @Attribute({ alias: "SomeVal" })
        public someVal: string[];

        // @ts-expect-no-error: targetKey 'modelTwos' exists on ModelOne as type of ModelTwo[]
        @HasAndBelongsToMany(() => ModelOne, { targetKey: "modelTwos" })
        // @ts-expect-no-error: Is array of associated model
        public modelOnes: ModelOne[];
      }
    });

    it("related type (not array) - will error if the targetKey that is referenced is not an Array of the related type", () => {
      @Entity
      class ModelOne extends MockTable {
        // @ts-expect-error: targetKey on ModelTwo is not an array of ModelOne
        @HasAndBelongsToMany(() => ModelTwo, { targetKey: "modelOnes" })
        public modelTwos: ModelTwo[];
      }

      @Entity
      class ModelTwo extends MockTable {
        @Attribute({ alias: "SomeVal" })
        public someVal: string[];

        // @ts-expect-error: attribute is not an array of ModelOne
        @HasAndBelongsToMany(() => ModelOne, { targetKey: "modelTwos" })
        public modelOnes: ModelOne;
      }
    });
  });
});
