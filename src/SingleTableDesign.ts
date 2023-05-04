import "reflect-metadata";
import DynamoBase from "./DynamoBase";
import EntityMixin from "./mixins/Entity";
import {
  TABLE_NAME,
  PRIMARY_KEY,
  SORT_KEY,
  DELIMITER,
  ENTITY_TYPE
} from "./symbols";
import Metadata, { TableMetadata, EntityMetadata } from "./metadata";

import { TableConstructor } from "./decorators/Table";

type GConstructor<T = {}> = new (...args: any[]) => T;

// TODO can I make this abstract?
class SingleTableDesign {
  // TODO are these instance methods needed?
  // private tableMetadata: TableMetadata;
  // private entityMetadata: EntityMetadata;
  // private readonly entityType: string;

  // constructor() {
  //   this.entityType = this.constructor.name;
  //   this.entityMetadata = Metadata.entities[this.entityType];
  //   this.tableMetadata = Metadata.tables[this.entityMetadata.tableName];

  //   debugger;
  // }

  // TODO add options
  public static async findById<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    id: string
  ): Promise<T | null> {
    // TODO can I get better typing on this?

    // const EntityClass = Object.getPrototypeOf(this);

    // const EntityClass = SingleTableDesign.getEntityClass(this);
    // const entity = new EntityClass();

    // debugger;

    // // const Entity = EntityMixin(this);
    // // debugger;
    // // const entity = new Entity();
    // // debugger;

    // const { name: tableName, primaryKey, sortKey } = entity.tableMetadata;

    // debugger;

    // // TODO should this be in constructor?
    // const dynamo = new DynamoBase(tableName);
    // const res = await dynamo.findById({
    //   [primaryKey]: entity.pk(id),
    //   [sortKey]: entity.entityType
    // });

    // debugger;

    // return res ? entity.serialize(res) : null;

    const entityMetadata = Metadata.entities[this.name];
    const tableMetadata = Metadata.tables[entityMetadata.tableName];

    const dynamo = new DynamoBase(tableMetadata.name);
    const res = await dynamo.findById({
      [tableMetadata.primaryKey]: this.pk(id, tableMetadata.delimiter),
      [tableMetadata.sortKey]: this.name
    });

    debugger;

    const instance = new this();

    return res ? instance.serialize(res, entityMetadata.attributes) : null;
  }

  // private static getEntityClass<TBase extends GConstructor>(Base: TBase) {
  //   class Entity extends Base {}

  //   // Apply original class descriptors to the new class
  //   const ownPropertyDescriptors = Object.getOwnPropertyDescriptors(Base);

  //   const { prototype, ...descriptors } = ownPropertyDescriptors;

  //   Object.defineProperties(Entity, descriptors);

  //   return Entity;
  // }

  // TODO make this show correctly
  private static pk(id: string, delimiter: string) {
    return `${this.name}${delimiter}${id}`;
  }

  // TODO make this show correctly
  private serialize(
    tableItem: Record<string, unknown>,
    attrs: Record<string, any>
  ) {
    // let target = Object.getPrototypeOf(this);
    const target: Record<string, any> = {};
    // const attrs = this.entityMetadata.attributes;

    Object.entries(tableItem).forEach(([attr, value]) => {
      if (attrs[attr]) {
        const entityKey = attrs[attr].name;
        target[`${entityKey}`] = value;
      }
    }, {});

    return { ...this, ...target };
  }

  // TODO delete me. this is not
  public someMethod() {
    return "bla";
  }
}

export default SingleTableDesign;
