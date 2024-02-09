import {
  Entity,
  Attribute,
  ForeignKeyAttribute,
  HasOne,
  BelongsTo
} from "../../../src/decorators";
import { type ForeignKey } from "../../../src/types";
import { MockTable } from "../../integration/mockModels";

describe("HasOne", () => {
  describe("types", () => {
    it("will allow the foreign key to be an attribute on the associated entities model", () => {
      @Entity
      class ModelOne extends MockTable {
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        @BelongsTo(() => ModelTwo, { foreignKey: "key1" })
        public modelTwoRel: ModelTwo;
      }

      @Entity
      class ModelTwo extends MockTable {
        // @ts-expect-no-error: foreign key can only be linked to a key on the associated model
        @HasOne(() => ModelOne, { foreignKey: "key1" })
        public modelOneRel: ModelOne;
      }
    });

    it("requires the foreign key to be an attribute to be of type ForeignKey", () => {
      @Entity
      class ModelOne extends MockTable {
        @Attribute({ alias: "Key1" })
        public key1: string;

        // @ts-expect-error: foreign key must be of type ForeignKey
        @BelongsTo(() => ModelTwo, { foreignKey: "key1" })
        public modelTwoRel: ModelTwo;
      }

      @Entity
      class ModelTwo extends MockTable {
        // @ts-expect-error: foreign key must be of type ForeignKey
        @HasOne(() => ModelOne, { foreignKey: "key1" })
        public modelOneRel: ModelOne;
      }
    });

    it("will not allow the foreign key to be an attribute defined on itself", () => {
      @Entity
      class ModelOne extends MockTable {
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        @BelongsTo(() => ModelTwo, { foreignKey: "key1" })
        public modelTwoRel: ModelTwo;
      }

      @Entity
      class ModelTwo extends MockTable {
        @Attribute({ alias: "Key2" })
        public key2: string;

        // @ts-expect-error: foreign key cannot be defined on itself
        @HasOne(() => ModelOne, { foreignKey: "key2" })
        public modelOneRel: ModelOne;
      }
    });

    it("will allow the property to be optional", () => {
      @Entity
      class ModelOne extends MockTable {
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        @BelongsTo(() => ModelTwo, { foreignKey: "key1" })
        public modelTwoRel: ModelTwo;
      }

      @Entity
      class ModelTwo extends MockTable {
        // @ts-expect-no-error: HasOne rel can be optional
        @HasOne(() => ModelOne, { foreignKey: "key1" })
        public modelOneRel?: ModelOne;
      }
    });

    it("will not allow relationship attributes as the foreign key", () => {
      @Entity
      class ModelOne extends MockTable {
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        @BelongsTo(() => ModelTwo, { foreignKey: "key1" })
        public modelTwoRel: ModelTwo;
      }

      @Entity
      class ModelTwo extends MockTable {
        // @ts-expect-error: foreign key must not be linked to a relationship key
        @HasOne(() => ModelOne, { foreignKey: "modelTwoRel" })
        public modelOneRel: ModelOne;
      }
    });

    it("will not allow function attributes as the foreign key", () => {
      @Entity
      class ModelOne extends MockTable {
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        @BelongsTo(() => ModelTwo, { foreignKey: "key1" })
        public modelTwoRel: ModelTwo;

        public someFunction(): string {
          return "123";
        }
      }

      @Entity
      class ModelTwo extends MockTable {
        // @ts-expect-error: foreign key must not be linked to a function key
        @HasOne(() => ModelOne, { foreignKey: "someFunction" })
        public modelOneRel: ModelOne;
      }
    });

    it("does not allow the attribute of a HasOne to be an array", () => {
      @Entity
      class ModelOne extends MockTable {
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        @BelongsTo(() => ModelTwo, { foreignKey: "key1" })
        public modelTwoRel: ModelTwo;
      }

      @Entity
      class ModelTwo extends MockTable {
        @Attribute({ alias: "Key2" })
        public key2: string;

        // @ts-expect-error: a HasOne rel cannot be an array
        @HasOne(() => ModelOne, { foreignKey: "key1" })
        public modelOneRel: ModelOne[];
      }
    });
  });
});
