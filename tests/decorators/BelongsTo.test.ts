import {
  Entity,
  Attribute,
  ForeignKeyAttribute,
  BelongsTo,
  HasOne,
  NullableForeignKeyAttribute,
  HasMany
} from "../../src/decorators";
import type { NullableForeignKey, ForeignKey } from "../../src/types";
import { MockTable } from "../integration/mockModels";

describe("BelongsTo", () => {
  describe("types", () => {
    it("the foreign key attribute must be defined on itself", () => {
      @Entity
      class ModelOne extends MockTable {
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        // @ts-expect-no-error: foreign key can only be linked to a key on itself
        @BelongsTo(() => ModelTwo, { foreignKey: "key1" })
        public modelTwoRel: ModelTwo;
      }

      @Entity
      class ModelTwo extends MockTable {
        @HasOne(() => ModelOne, { foreignKey: "key1" })
        public modelOneRel: ModelOne;
      }
    });

    it("requires the foreign key attribute to be of type ForeignKey", () => {
      @Entity
      class ModelOne extends MockTable {
        @Attribute({ alias: "Key1" })
        public key1: string; // This has to be ForeignKey

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

    it("BelongsTo -> HasOne: The BelongsTo can be defined as optional if linked through a NullableForeignKey", () => {
      @Entity
      class ModelOne extends MockTable {
        @NullableForeignKeyAttribute({ alias: "Key1" })
        public key1?: NullableForeignKey;

        // @ts-expect-no-error: BelongsTo attribute can be optional when linked through a NullableForeignKey
        @BelongsTo(() => ModelTwo, { foreignKey: "key1" })
        public modelTwoRel?: ModelTwo;
      }

      @Entity
      class ModelTwo extends MockTable {
        @HasOne(() => ModelOne, { foreignKey: "key1" })
        public modelOneRel: ModelOne;
      }
    });

    it("BelongsTo -> HasOne: The BelongsTo can not be defined as optional if linked through a ForeignKey (non nullable)", () => {
      @Entity
      class ModelOne extends MockTable {
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        // @ts-expect-error: BelongsTo attribute can not be optional when linked through a ForeignKey (non nullable)
        @BelongsTo(() => ModelTwo, { foreignKey: "key1" })
        public modelTwoRel?: ModelTwo;
      }

      @Entity
      class ModelTwo extends MockTable {
        // TODO... should this NOT allow to be defined as undefined because its linked through a (nullable) ForeignKey
        @HasOne(() => ModelOne, { foreignKey: "key1" })
        public modelOneRel: ModelOne;
      }
    });

    it("BelongsTo -> HasMany: The BelongsTo can be defined as optional if linked through a NullableForeignKey", () => {
      @Entity
      class ModelOne extends MockTable {
        @NullableForeignKeyAttribute({ alias: "Key1" })
        public key1?: NullableForeignKey;

        // @ts-expect-no-error: BelongsTo attribute can be optional when linked through a NullableForeignKey
        @BelongsTo(() => ModelTwo, { foreignKey: "key1" })
        public modelTwoRel?: ModelTwo;
      }

      @Entity
      class ModelTwo extends MockTable {
        @HasMany(() => ModelOne, { foreignKey: "key1" })
        public modelOneRels: ModelOne[];
      }
    });

    it("BelongsTo -> HasMany: The BelongsTo can not be defined as optional if linked through a ForeignKey (non nullable)", () => {
      @Entity
      class ModelOne extends MockTable {
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        // @ts-expect-error: BelongsTo attribute can not be optional when linked through a ForeignKey (non nullable)
        @BelongsTo(() => ModelTwo, { foreignKey: "key1" })
        public modelTwoRel?: ModelTwo;
      }

      @Entity
      class ModelTwo extends MockTable {
        @HasMany(() => ModelOne, { foreignKey: "key1" })
        public modelOneRels: ModelOne[];
      }
    });

    it("does not all the foreign key attribute to be defined on the associated model", () => {
      @Entity
      class ModelOne extends MockTable {
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        // @ts-expect-error: foreign key can only be linked to a key on itself
        @BelongsTo(() => ModelTwo, { foreignKey: "key2" })
        public modelTwoRel: ModelTwo;
      }

      @Entity
      class ModelTwo extends MockTable {
        @Attribute({ alias: "Key2" })
        public key2: string;

        @HasOne(() => ModelOne, { foreignKey: "key1" })
        public modelOneRel: ModelOne;
      }
    });

    it("does not all the foreign key attribute to be a relationship attribute", () => {
      @Entity
      class ModelOne extends MockTable {
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        @ForeignKeyAttribute({ alias: "Key3" })
        public key3: ForeignKey;

        // @ts-expect-error: foreign key cannot be a relationship key
        @BelongsTo(() => ModelTwo, { foreignKey: "modelThreeRel" })
        public modelTwoRel: ModelTwo;

        @BelongsTo(() => ModelThree, { foreignKey: "key3" })
        public modelThreeRel: ModelThree;
      }

      @Entity
      class ModelTwo extends MockTable {
        @HasOne(() => ModelOne, { foreignKey: "key1" })
        public modelOneRel: ModelOne;
      }

      @Entity
      class ModelThree extends MockTable {
        @HasOne(() => ModelOne, { foreignKey: "key3" })
        public modelOneRel: ModelOne;
      }
    });

    it("does not allow the foreign key to be a function key", () => {
      @Entity
      class ModelOne extends MockTable {
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        // @ts-expect-error: foreign key must not be linked to a function key
        @BelongsTo(() => ModelTwo, { foreignKey: "someFunction" })
        public modelTwoRel: ModelTwo;

        public someFunction(): string {
          return "123";
        }
      }

      @Entity
      class ModelTwo extends MockTable {
        @HasOne(() => ModelOne, { foreignKey: "key1" })
        public modelOneRel: ModelOne;
      }
    });

    it("does not allow the attribute of BelongsTo to be an array", () => {
      @Entity
      class ModelOne extends MockTable {
        @ForeignKeyAttribute({ alias: "Key1" })
        public key1: ForeignKey;

        // @ts-expect-error: a BelongsTo rel cannot be an array
        @BelongsTo(() => ModelTwo, { foreignKey: "key1" })
        public modelTwoRel: ModelTwo[];
      }

      @Entity
      class ModelTwo extends MockTable {
        @HasOne(() => ModelOne, { foreignKey: "key1" })
        public modelOneRel: ModelOne;
      }
    });
  });
});
