/* eslint-disable @typescript-eslint/no-unused-vars */
import DynaRecord from "../../index.js";
import { Table, Entity } from "../../src/decorators/index.js";
import {
  PartitionKeyAttribute,
  SortKeyAttribute,
  StringAttribute,
  NumberAttribute,
  ForeignKeyAttribute,
  HasMany,
  BelongsTo
} from "../../src/decorators/index.js";
import Metadata from "../../src/metadata/index.js";
import type { ForeignKey, PartitionKey, SortKey } from "../../src/types.js";

@Table({ name: "entity-test-table" })
abstract class TestTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

// Intermediate abstract class between the table and an entity — not an entity itself
abstract class BaseVehicle extends TestTable {
  @StringAttribute({ alias: "Make" })
  public readonly make: string;
}

@Entity
class Car extends BaseVehicle {
  declare readonly type: "Car";

  @NumberAttribute({ alias: "Doors" })
  public readonly doors: number;
}

@Entity
class Garage extends TestTable {
  declare readonly type: "Garage";

  @HasMany(() => Truck, { foreignKey: "garageId" })
  public readonly trucks: Truck[];
}

@Entity
class Truck extends TestTable {
  declare readonly type: "Truck";

  @StringAttribute({ alias: "TowingCapacity" })
  public readonly towingCapacity: string;

  @ForeignKeyAttribute(() => Garage, { alias: "GarageId" })
  public readonly garageId: ForeignKey<Garage>;

  @BelongsTo(() => Garage, { foreignKey: "garageId" })
  public readonly garage: Garage;
}

@Entity
class Pickup extends Truck {
  // @ts-expect-error: narrowing the inherited literal `type` of a concrete parent entity
  declare readonly type: "Pickup";

  @StringAttribute({ alias: "BedLength" })
  public readonly bedLength: string;
}

describe("Entity decorator", () => {
  describe("types", () => {
    it("accepts an entity with declare readonly type", () => {
      // @ts-expect-no-error: Entity has declare readonly type
      @Entity
      class ValidEntity extends TestTable {
        declare readonly type: "ValidEntity";

        @StringAttribute({ alias: "Name" })
        public readonly name: string;
      }
    });

    it("rejects an entity without declare readonly type", () => {
      // @ts-expect-error: Entity must declare readonly type
      @Entity
      class MissingTypeEntity extends TestTable {
        @StringAttribute({ alias: "Name" })
        public readonly name: string;
      }
    });

    it("rejects an entity with type: string instead of a literal", () => {
      // @ts-expect-error: type must be a string literal, not 'string'
      @Entity
      class WideTypeEntity extends TestTable {
        declare readonly type: string;

        @StringAttribute({ alias: "Name" })
        public readonly name: string;
      }
    });
  });

  describe("entity inheritance", () => {
    it("registers a direct child of the table class against the table", () => {
      expect(Metadata.getEntity("Truck").tableClassName).toBe("TestTable");
    });

    it("registers an entity extending another entity against the table class", () => {
      expect(Metadata.getEntity("Pickup").tableClassName).toBe("TestTable");
    });

    it("registers an entity extending an intermediate abstract class against the table class", () => {
      expect(Metadata.getEntity("Car").tableClassName).toBe("TestTable");
    });

    it("resolves table metadata for entities registered through inheritance", () => {
      expect(Metadata.getEntityTable("Pickup").name).toBe("entity-test-table");
      expect(Metadata.getEntityTable("Car").name).toBe("entity-test-table");
    });

    it("inherits attribute metadata from a parent entity", () => {
      const attrs = Metadata.getEntityAttributes("Pickup");
      expect(attrs.towingCapacity).toBeDefined();
      expect(attrs.garageId).toBeDefined();
      expect(attrs.bedLength).toBeDefined();
    });

    it("inherits attribute metadata from an intermediate abstract class", () => {
      const attrs = Metadata.getEntityAttributes("Car");
      expect(attrs.make).toBeDefined();
      expect(attrs.doors).toBeDefined();
    });

    it("does not leak child entity attributes onto the parent entity", () => {
      const attrs = Metadata.getEntityAttributes("Truck");
      expect(attrs.towingCapacity).toBeDefined();
      expect(attrs.bedLength).toBeUndefined();
    });

    it("inherits relationship metadata from a parent entity", () => {
      const rels = Metadata.getEntity("Pickup").relationships;
      expect(rels.garage).toMatchObject({
        type: "BelongsTo",
        propertyName: "garage",
        foreignKey: "garageId"
      });
    });

    it("includes entities registered through inheritance in getEntitiesForTable", () => {
      const entities = Metadata.getEntitiesForTable("TestTable");
      expect(Object.keys(entities)).toEqual(
        expect.arrayContaining(["Truck", "Pickup", "Car", "Garage"])
      );
    });

    it("builds partition key values for entities registered through inheritance", () => {
      const { delimiter } = Metadata.getEntityTable("Pickup");
      expect(Pickup.partitionKeyValue("123")).toBe(`Pickup${delimiter}123`);
    });

    it("throws when an entity does not extend a class decorated with Table", () => {
      expect(() => {
        @Entity
        class Orphan extends DynaRecord {
          declare readonly type: "Orphan";
        }
      }).toThrow(
        "Entity Orphan must extend a class decorated with @Table, either directly or through its class hierarchy"
      );
    });
  });
});
