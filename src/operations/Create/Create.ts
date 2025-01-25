import type DynaRecord from "../../DynaRecord";
import { v4 as uuidv4 } from "uuid";
import type { DynamoTableItem, EntityClass } from "../../types";
import {
  type ConditionCheck,
  TransactGetBuilder,
  TransactWriteBuilder
} from "../../dynamo-utils";
import { entityToTableItem, tableItemToEntity } from "../../utils";
import OperationBase from "../OperationBase";
import { extractForeignKeyFromEntity, buildBelongsToLinkKey } from "../utils";
import type { CreateOptions } from "./types";
import {
  type EntityDefinedAttributes,
  type EntityAttributeDefaultFields,
  type EntityAttributesOnly
} from "../types";
import { isBelongsToRelationship } from "../../metadata/utils";
import Metadata, { type BelongsToRelationship } from "../../metadata";

/**
 * Represents an operation to create a new entity record in DynamoDB, including all necessary
 * denormalized relationship records. This ensures that "BelongsTo" and "HasMany" relationships
 * are properly maintained at the time of entity creation.
 *
 * **What it does:**
 * - Converts the given attributes into a DynamoDB-compatible format.
 * - Inserts a new entity record, ensuring no duplicate primary key conflicts.
 * - For each "BelongsTo" relationship that includes a foreign key:
 *   - Verifies the referenced entity exists.
 *   - Creates a denormalized link record in the related entity's partition.
 * - If the entity's relationships imply additional denormalized records in its own partition,
 *   those are also created after verifying the related entities exist.
 *
 * Only attributes defined on the entity model can be set, validated both at compile-time and runtime.
 *
 * @template T - The type of the entity being created, extending `DynaRecord`.
 */
class Create<T extends DynaRecord> extends OperationBase<T> {
  readonly #transactionBuilder: TransactWriteBuilder;

  constructor(Entity: EntityClass<T>) {
    super(Entity);
    this.#transactionBuilder = new TransactWriteBuilder();
  }

  /**
   * Executes the create operation.
   *
   * **What it does:**
   * - Parses and validates the provided attributes against the entity schema.
   * - Generates any required reserved attributes (like `id`, `createdAt`, and `updatedAt`).
   * - Inserts the new entity record into DynamoDB, ensuring it doesn't already exist.
   * - For each defined "BelongsTo" relationship, ensures the related entity exists and creates
   *   a corresponding denormalized "link" record.
   * - If the entity's creation implies that related records must also be denormalized into its own
   *   partition (due to "BelongsTo" links), retrieves and inserts those link records.
   *
   * @param attributes - Attributes to initialize the new entity. Must be defined on the model and valid per schema constraints.
   * @returns A promise that resolves to the newly created entity with all attributes, including automatically set fields.
   * @throws If the entity already exists, a uniqueness violation error is raised.
   * @throws If a required foreign key does not correspond to an existing entity, an error is raised.
   */
  public async run(
    attributes: CreateOptions<T>
  ): Promise<EntityAttributesOnly<T>> {
    const entityAttrs =
      this.entityMetadata.parseRawEntityDefinedAttributes(attributes);

    const reservedAttrs = this.buildReservedAttributes(entityAttrs);
    const entityData = { ...reservedAttrs, ...entityAttrs };

    const tableItem = entityToTableItem(this.EntityClass, entityData);

    this.buildPutItemTransaction(tableItem, entityData.id);
    this.buildBelongsToTransactions(entityData, tableItem);

    // Attempt to fetch all belongs-to entities to properly create reverse denormalization links
    const belongsToTableItems = await this.getBelongsToTableItems(entityData);

    // If there are any belongs-to relationships, add the inverse link records into the new entity's partition
    if (belongsToTableItems.length > 0) {
      this.buildAddBelongsToLinkToSelfTransactions(
        reservedAttrs.id,
        belongsToTableItems
      );
    }

    await this.#transactionBuilder.executeTransaction();

    return tableItemToEntity<T>(this.EntityClass, tableItem);
  }

  /**
   * Builds and returns entity attributes that must be reserved for system usage.
   *
   * **What it does:**
   * - Generates a unique entity ID if the entity's schema does not specify an `id` field.
   * - Sets `createdAt` and `updatedAt` to the current time.
   * - Builds the partition and sort key values based on the entity's class and generated ID.
   *
   * @param entityAttrs - The user-provided entity attributes.
   * @returns The combined attributes including all reserved fields.
   * @private
   */
  private buildReservedAttributes(
    entityAttrs: EntityDefinedAttributes<DynaRecord>
  ): EntityAttributesOnly<DynaRecord> {
    const { idField } = this.entityMetadata;

    const id =
      idField === undefined
        ? uuidv4()
        : entityAttrs[idField as keyof typeof entityAttrs];

    const createdAt = new Date();

    const pk = this.tableMetadata.partitionKeyAttribute.name;
    const sk = this.tableMetadata.sortKeyAttribute.name;

    const keys = {
      [pk]: this.EntityClass.partitionKeyValue(id),
      [sk]: this.EntityClass.name
    };

    const defaultAttrs: EntityAttributeDefaultFields = {
      id,
      type: this.EntityClass.name,
      createdAt,
      updatedAt: createdAt
    };

    return { ...keys, ...defaultAttrs };
  }

  /**
   * Adds a "PutItem" transaction for the new entity record.
   *
   * **What it does:**
   * - Ensures the primary key does not already exist, preventing duplication.
   *
   * @param tableItem - The DynamoDB table item for the entity to put.
   * @param id - The unique identifier of the new entity.
   * @private
   */
  private buildPutItemTransaction(
    tableItem: DynamoTableItem,
    id: string
  ): void {
    const { name: tableName } = this.tableMetadata;

    const putExpression = {
      TableName: tableName,
      Item: tableItem,
      ConditionExpression: `attribute_not_exists(${this.partitionKeyAlias})`
    };
    this.#transactionBuilder.addPut(
      putExpression,
      `${this.EntityClass.name} with id: ${id} already exists`
    );
  }

  /**
   * Adds "PutItem" transactions to create denormalized "BelongsTo" link records in the related entity's partitions.
   *
   * **What it does:**
   * - For each "BelongsTo" relationship with a defined foreign key, checks that the related entity exists.
   * - Inserts a "link" item into the related entity's partition to maintain denormalized relationships.
   *
   * @param entityData - The complete set of entity attributes for the new entity.
   * @param tableItem - The main entity's DynamoDB table item.
   * @private
   */
  private buildBelongsToTransactions(
    entityData: EntityAttributesOnly<DynaRecord>,
    tableItem: DynamoTableItem
  ): void {
    const tableName = this.tableMetadata.name;

    for (const relMeta of this.entityMetadata.belongsToRelationships) {
      const foreignKey = extractForeignKeyFromEntity(relMeta, entityData);

      if (foreignKey !== undefined) {
        // Ensure referenced entity exists before linking
        this.buildRelationshipExistsConditionTransaction(relMeta, foreignKey);

        const key = buildBelongsToLinkKey(
          this.EntityClass,
          entityData.id,
          relMeta,
          foreignKey
        );

        this.#transactionBuilder.addPut(
          {
            TableName: tableName,
            Item: { ...tableItem, ...key },
            ConditionExpression: `attribute_not_exists(${this.partitionKeyAlias})`
          },
          `${relMeta.target.name} with id: ${foreignKey} already has an associated ${this.EntityClass.name}`
        );
      }
    }
  }

  /**
   * Retrieves the DynamoDB items for all entities that the new entity references via "BelongsTo" relationships.
   *
   * **What it does:**
   * - For each "BelongsTo" relationship, queries DynamoDB for the related entity record.
   * - Returns all found related items as an array.
   * - If no relationships or no foreign keys are present, returns an empty array.
   *
   * @param entityData - The attributes of the entity being created.
   * @returns A promise that resolves to an array of related DynamoDB items.
   * @private
   */
  private async getBelongsToTableItems(
    entityData: EntityAttributesOnly<DynaRecord>
  ): Promise<DynamoTableItem[]> {
    const { name: tableName } = this.tableMetadata;
    const transactionBuilder = new TransactGetBuilder();
    const relMetas = this.entityMetadata.relationships;

    const belongsToRelMetas = Object.values(relMetas).filter(relMeta =>
      isBelongsToRelationship(relMeta)
    );

    belongsToRelMetas.forEach(relMeta => {
      const fk = extractForeignKeyFromEntity(relMeta, entityData);
      if (fk !== undefined) {
        transactionBuilder.addGet({
          TableName: tableName,
          Key: {
            [this.partitionKeyAlias]: relMeta.target.partitionKeyValue(fk),
            [this.sortKeyAlias]: relMeta.target.name
          }
        });
      }
    });

    if (transactionBuilder.hasTransactions()) {
      const results = await transactionBuilder.executeTransaction();
      return results.reduce<DynamoTableItem[]>((acc, res) => {
        if (res.Item !== undefined) acc.push(res.Item);
        return acc;
      }, []);
    }

    return [];
  }

  /**
   * Adds a condition check transaction to ensure that the entity referenced by a "BelongsTo" foreign key exists.
   *
   * **What it does:**
   * - Checks the existence of the related entity before creating the link item.
   * - If the related entity does not exist, the transaction will fail, preventing creation of dangling references.
   *
   * @param rel - The "BelongsTo" relationship metadata.
   * @param relationshipId - The foreign key value referencing the related entity.
   * @private
   */
  private buildRelationshipExistsConditionTransaction(
    rel: BelongsToRelationship,
    relationshipId: string
  ): void {
    const { name: tableName } = this.tableMetadata;
    const errMsg = `${rel.target.name} with ID '${relationshipId}' does not exist`;

    const conditionCheck: ConditionCheck = {
      TableName: tableName,
      Key: {
        [this.partitionKeyAlias]: rel.target.partitionKeyValue(relationshipId),
        [this.sortKeyAlias]: rel.target.name
      },
      ConditionExpression: `attribute_exists(${this.partitionKeyAlias})`
    };

    this.#transactionBuilder.addConditionCheck(conditionCheck, errMsg);
  }

  /**
   * For each related entity referenced by a "BelongsTo" relationship, insert a denormalized copy of that entity
   * into the new entity's partition. This maintains a consistent, denormalized view of relationships.
   *
   * **What it does:**
   * - Adds "PutItem" operations to create link records in the newly created entity's partition.
   * - Ensures these link records don't already exist.
   *
   * @param entityId - The newly created entity's ID.
   * @param belongsToTableItems - The table items representing each related "BelongsTo" entity.
   * @private
   */
  private buildAddBelongsToLinkToSelfTransactions(
    entityId: string,
    belongsToTableItems: DynamoTableItem[]
  ): void {
    const pk = this.EntityClass.partitionKeyValue(entityId);
    const typeAlias = this.tableMetadata.defaultAttributes.type.alias;

    belongsToTableItems.forEach(tableItem => {
      const relationshipType = tableItem[typeAlias];

      const key = {
        [this.partitionKeyAlias]: pk,
        [this.sortKeyAlias]: relationshipType
      };

      this.#transactionBuilder.addPut(
        {
          TableName: this.tableMetadata.name,
          Item: { ...tableItem, ...key },
          ConditionExpression: `attribute_not_exists(${this.partitionKeyAlias})`
        },
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${this.EntityClass.name} already has an associated ${relationshipType}`
      );
    });
  }
}

export default Create;
