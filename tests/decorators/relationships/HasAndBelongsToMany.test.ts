import {
  Entity,
  HasAndBelongsToMany,
  StringAttribute
} from "../../../src/decorators";
import { JoinTable } from "../../../src/relationships";
import type { ForeignKey } from "../../../src/types";
import { MockTable } from "../../integration/mockModels";

describe("HasAndBelongsToMany", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("types", () => {
    it("will allow relationships where the targetKey references an attribute on the related model is an Array of the models type", () => {
      class ModelOneModelTwo extends JoinTable<ModelOne, ModelTwo> {
        public modelOneId: ForeignKey;
        public modelTwoId: ForeignKey;
      }

      @Entity
      class ModelOne extends MockTable {
        @HasAndBelongsToMany(() => ModelTwo, {
          // @ts-expect-no-error: targetKey 'modelOnes' exists on ModelTwo as type of ModelOne[]
          targetKey: "modelOnes",
          through: () => ({
            // @ts-expect-no-error: joinTable value is a JoinTable
            joinTable: ModelOneModelTwo,
            // @ts-expect-no-error: foreignKey exists on join table
            foreignKey: "modelOneId"
          })
        })
        // @ts-expect-no-error: Is array of associated model
        public modelTwos: ModelTwo[];
      }

      @Entity
      class ModelTwo extends MockTable {
        @HasAndBelongsToMany(() => ModelOne, {
          // @ts-expect-no-error: targetKey 'modelTwos' exists on ModelOne as type of ModelTwo[]
          targetKey: "modelTwos",
          through: () => ({
            // @ts-expect-no-error: joinTable value is a JoinTable
            joinTable: ModelOneModelTwo,
            // @ts-expect-no-error: foreignKey exists on join table
            foreignKey: "modelTwoId"
          })
        })
        // @ts-expect-no-error: Is array of associated model
        public modelOnes: ModelOne[];
      }
    });

    it("attribute - will error if the targetKey that is referenced is not an Array of the related type", () => {
      class ModelOneModelTwo extends JoinTable<ModelOne, ModelTwo> {
        public modelOneId: ForeignKey;
        public modelTwoId: ForeignKey;
      }

      @Entity
      class ModelOne extends MockTable {
        @HasAndBelongsToMany(() => ModelTwo, {
          // @ts-expect-error: targetKey on ModelTwo is not an array of ModelOne
          targetKey: "someVal",
          through: () => ({
            joinTable: ModelOneModelTwo,
            foreignKey: "modelOneId"
          })
        })
        // @ts-expect-no-error: Is array of associated model
        public modelTwos: ModelTwo[];
      }

      @Entity
      class ModelTwo extends MockTable {
        @StringAttribute({ alias: "SomeVal" })
        public someVal: string;

        @HasAndBelongsToMany(() => ModelOne, {
          // @ts-expect-no-error: targetKey 'modelTwos' exists on ModelOne as type of ModelTwo[]
          targetKey: "modelTwos",
          through: () => ({
            joinTable: ModelOneModelTwo,
            foreignKey: "modelTwoId"
          })
        })
        // @ts-expect-no-error: Is array of associated model
        public modelOnes: ModelOne[];
      }
    });

    it("related type (not array) - will error if the targetKey that is referenced is not an Array of the related type", () => {
      class ModelOneModelTwo extends JoinTable<ModelOne, ModelTwo> {
        public modelOneId: ForeignKey;
        public modelTwoId: ForeignKey;
      }

      @Entity
      class ModelOne extends MockTable {
        @HasAndBelongsToMany(() => ModelTwo, {
          // @ts-expect-error: targetKey on ModelTwo is not an array of ModelOne
          targetKey: "modelOnes",
          through: () => ({
            joinTable: ModelOneModelTwo,
            foreignKey: "modelOneId"
          })
        })
        public modelTwos: ModelTwo[];
      }

      @Entity
      class ModelTwo extends MockTable {
        @StringAttribute({ alias: "SomeVal" })
        public someVal: string;

        // @ts-expect-error: attribute is not an array of ModelOne
        @HasAndBelongsToMany(() => ModelOne, {
          targetKey: "modelTwos",
          through: () => ({
            joinTable: ModelOneModelTwo,
            foreignKey: "modelTwoId"
          })
        })
        public modelOnes: ModelOne;
      }
    });

    it("will have an error if the joinTable is not of type JoinTable", () => {
      class ModelOneModelTwo extends JoinTable<ModelOne, ModelTwo> {
        public modelOneId: ForeignKey;
        public modelTwoId: ForeignKey;
      }

      @Entity
      class ModelOne extends MockTable {
        @HasAndBelongsToMany(() => ModelTwo, {
          targetKey: "modelOnes",
          through: () => ({
            // @ts-expect-error: Is not of type JoinTable
            joinTable: ModelTwo,
            // @ts-expect-error: Attribute does not exist on provided join table
            foreignKey: "modelOneId"
          })
        })
        // @ts-expect-no-error: Is array of associated model
        public modelTwos: ModelTwo[];
      }

      @Entity
      class ModelTwo extends MockTable {
        @HasAndBelongsToMany(() => ModelOne, {
          targetKey: "modelTwos",
          through: () => ({
            joinTable: ModelOneModelTwo,
            foreignKey: "modelTwoId"
          })
        })
        // @ts-expect-no-error: Is array of associated model
        public modelOnes: ModelOne[];
      }
    });

    it("will have an error if the foreign key provided in the 'through' prop does not exist on the join table", () => {
      class ModelOneModelTwo extends JoinTable<ModelOne, ModelTwo> {
        public modelOneId: ForeignKey;
        public modelTwoId: ForeignKey;
      }

      @Entity
      class ModelOne extends MockTable {
        @HasAndBelongsToMany(() => ModelTwo, {
          targetKey: "modelOnes",
          through: () => ({
            joinTable: ModelOneModelTwo,
            // @ts-expect-error: foreignKey does not exist on join table
            foreignKey: "bad"
          })
        })
        public modelTwos: ModelTwo[];
      }

      @Entity
      class ModelTwo extends MockTable {
        @HasAndBelongsToMany(() => ModelOne, {
          targetKey: "modelTwos",
          through: () => ({
            joinTable: ModelOneModelTwo,
            foreignKey: "modelTwoId"
          })
        })
        public modelOnes: ModelOne[];
      }
    });
  });
});
