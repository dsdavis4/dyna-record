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

// TODO can I make this abstract?
class SingleTableDesign {
  private readonly tableName: string;
  private readonly primaryKey: string;
  private readonly sortKey: string;
  private readonly delimiter: string;
  private readonly entityType: string;

  // TODO START HERE can I use global storage instad of storing on each instance? See typeorm
  // So... instead of storing meta data for each table
  /*
  
  1. Make a meta data class (Singleton??)
     - Uses global storage
  2. In table decorator store a map of tables 
  3. In the initializer for atttributes see if the attribute has been added to global meta data class for the table and add it if not
  
  */
  constructor() {
    this.tableName = Reflect.getMetadata(TABLE_NAME, this.constructor);
    this.primaryKey = Reflect.getMetadata(PRIMARY_KEY, this.constructor);
    this.sortKey = Reflect.getMetadata(SORT_KEY, this.constructor);
    this.delimiter = Reflect.getMetadata(DELIMITER, this.constructor);
    this.entityType = Reflect.getMetadata(ENTITY_TYPE, this.constructor);
  }

  // TODO add options
  public static async findById<T extends SingleTableDesign>(
    this: { new (): T } & typeof SingleTableDesign,
    id: string
  ): Promise<T | null> {
    const Entity = EntityMixin(this);
    const entity = new Entity();

    // TODO should this be in constructor?
    const dynamo = new DynamoBase(entity.tableName);
    const res = await dynamo.findById({
      [entity.primaryKey]: entity.pk(id),
      [entity.sortKey]: entity.entityType
    });

    return res ? entity.serialize(res) : null;
  }

  private pk(id: string) {
    return `${this.entityType}${this.delimiter}${id}`;
  }

  // TODO delete me
  public someMethod() {
    return "bla";
  }
}

export default SingleTableDesign;
