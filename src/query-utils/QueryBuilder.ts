import { QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import { NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";
import Metadata, { TableMetadata } from "../metadata";

export type KeyConditions = Omit<
  QueryCommandInput["KeyConditions"],
  "undefined"
>;

interface FilterExpression {
  values: Record<string, NativeScalarAttributeValue>;
  expression: string;
}

type BeginsWithFilter = Record<"$beginsWith", NativeScalarAttributeValue>;

type FilterTypes =
  | BeginsWithFilter
  | NativeScalarAttributeValue
  | NativeScalarAttributeValue[];

// Filter value that does not have an '$or' key
type AndFilter = Record<string, FilterTypes>;
export type OrFilter = Record<"$or", AndFilter[]>;

type OrOptional = Omit<OrFilter, "$or"> & Partial<Pick<OrFilter, "$or">>;
export type FilterParams = (AndFilter | OrFilter) & OrOptional;

type AndOrFilter = FilterParams & OrFilter;

export type SortKeyCondition = BeginsWithFilter | NativeScalarAttributeValue;

const testing: AndOrFilter = {
  $or: [
    { createdAt: { $beginsWith: "2021-09-05" } },
    { status: "active" },
    { name: "ReadKegData", status: ["complete", "canceled"] }
  ],
  type: "Process",
  createdAt: { $beginsWith: "2021-09-05" },
  status: ["complete", "canceled"]
};

const bla: FilterParams = {
  $or: [
    { createdAt: { $beginsWith: "2021-09-05" } },
    { status: "active" },
    { name: "ReadKegData", status: ["complete", "canceled"] }
  ],
  type: "Process",
  createdAt: { $beginsWith: "2021-09-05" },
  status: ["complete", "canceled"]
};

const allAnd: FilterParams = {
  // $or: [
  //   { createdAt: { $beginsWith: "2021-09-05" } },
  //   { status: "active" },
  //   { name: "ReadKegData", status: ["complete", "canceled"] }
  // ],
  type: "Process",
  createdAt: { $beginsWith: "2021-09-05" },
  status: ["complete", "canceled"]
};

export interface QueryOptions {
  indexName?: string;
  filter?: FilterParams;
}

export interface QueryCommandProps {
  // entity: typeof DynamoBase;
  entityClassName: string; // TODO is this needed or should I pass tableMetadata?
  key: KeyConditions;
  // TODO should this be optional?
  // TODO make it so at least one of the params is required
  // TODO should filter be optional?
  options?: QueryOptions;
}

// TODO should I add explicit returns for all these functions?
class QueryBuilder {
  // private readonly doc: Record<string, NativeAttributeValue>;
  private attrCounter: number;
  private tableMetadata: TableMetadata;
  // private entityMetadata: EntityMetadata;

  // Lookup tableKey by modelKey: ex: { modelProp1: :"ModelProp1", modelProp2: :"ModelProp2" }
  private tableKeyLookup: Record<string, string>;

  constructor(private props: QueryCommandProps) {
    this.props = props;
    this.attrCounter = 0;

    const entityMetadata = Metadata.entities[props.entityClassName];
    this.tableMetadata = Metadata.tables[entityMetadata.tableName];

    // TODO should this be in meta data so its not recalcualted? That would mean more data in cache...
    this.tableKeyLookup = Object.entries(entityMetadata.attributes).reduce(
      (acc, [tableKey, attrMetadata]) => {
        acc[attrMetadata.name] = tableKey;
        return acc;
      },
      {} as Record<string, string>
    );
  }

  public build(): QueryCommandInput {
    const { indexName, filter } = this.props.options ?? {};
    const filterParams = filter && this.filterParams(filter);

    const keyFilter = this.andFilter(this.props.key);

    return {
      TableName: this.tableMetadata.name,
      ...(indexName && { IndexName: indexName }),
      ...(filterParams && { FilterExpression: filterParams.expression }),
      KeyConditionExpression: keyFilter.expression,
      ExpressionAttributeNames: this.expressionAttributeNames(),
      ExpressionAttributeValues: this.expressionAttributeValueParams(
        keyFilter,
        filterParams
      )
    };
  }

  private expressionAttributeValueParams(
    keyParams: FilterExpression,
    filterParams?: FilterExpression
  ): QueryCommandInput["ExpressionAttributeValues"] {
    const valueParams = this.props.options?.filter
      ? { ...keyParams.values, ...filterParams?.values }
      : keyParams.values;

    return Object.entries(valueParams).reduce(
      (params, [attrName, value]) => ({ ...params, [`:${attrName}`]: value }),
      {}
    );
  }

  private expressionAttributeNames(): QueryCommandInput["ExpressionAttributeNames"] {
    const { filter } = this.props.options || {};

    const accumulator = (obj: Record<string, string>, key: string) => {
      const tableKey = this.tableKeyLookup[key];
      obj[`#${tableKey}`] = tableKey;
      return obj;
    };

    let expressionAttributeNames = Object.keys(this.props.key).reduce(
      (acc, key) => accumulator(acc, key),
      {} as Record<string, string>
    );

    if (filter) {
      const { $or: orFilters = [], ...andFilters } = filter;

      const or = orFilters.reduce((acc: Record<string, string>, filter) => {
        Object.keys(filter).forEach(key => accumulator(acc, key));
        return acc;
      }, {} as Record<string, string>);

      const and = Object.keys(andFilters).reduce(
        (acc, key) => accumulator(acc, key),
        {} as Record<string, string>
      );

      expressionAttributeNames = { ...expressionAttributeNames, ...or, ...and };
    }

    return expressionAttributeNames;
  }

  // Note:
  // Supports 'AND' and 'OR'
  // Currently only works for '=', 'begins_with' or 'IN' operands
  // Does not support operations like 'contains' etc yet
  private filterParams(filter: FilterParams): FilterExpression {
    const isOrFilter = this.isOrFilter(filter);

    if (isOrFilter) {
      const isAndOrFilter = this.isAndOrFilter(filter);
      return isAndOrFilter ? this.andOrFilter(filter) : this.orFilter(filter);
    } else {
      return this.andFilter(filter);
    }
  }

  private andOrFilter(filter: AndOrFilter): FilterExpression {
    const { $or: _orFilters, ...andFilters } = filter;
    const orFilterParams = this.orFilter(filter);
    const andFilterParams = this.andFilter(andFilters);
    const expression = `(${orFilterParams.expression}) AND (${andFilterParams.expression})`;
    const values = { ...orFilterParams.values, ...andFilterParams.values };
    return { expression, values };
  }

  private andFilter(filter: KeyConditions | AndFilter): FilterExpression {
    const params = Object.entries(filter).reduce(
      (obj, [attr, value]) => {
        const { expression, values } = this.andCondition(attr, value);
        return {
          expression: obj.expression.concat(expression),
          values: { ...obj.values, ...values }
        };
      },
      { expression: "", values: {} }
    );
    params.expression = params.expression.slice(0, -5); // trim off the trailing " AND "
    return params;
  }

  private andCondition(attr: string, value: FilterTypes): FilterExpression {
    const tableKey = this.tableKeyLookup[attr];

    let condition;
    let values: Record<string, NativeScalarAttributeValue> = {};
    if (Array.isArray(value)) {
      const mappings = value.reduce((acc, value) => {
        const attr = `${tableKey}${++this.attrCounter}`;
        values[attr] = value;
        return acc.concat(`:${attr}`);
      }, [] as string[]);
      condition = `#${tableKey} IN (${mappings.join()})`;
    } else if (this.isBeginsWithFilter(value)) {
      const attr = `${tableKey}${++this.attrCounter}`;
      condition = `begins_with(#${tableKey}, :${attr})`;
      values = { [`${attr}`]: value.$beginsWith };
    } else {
      const attr = `${tableKey}${++this.attrCounter}`;
      condition = `#${tableKey} = :${attr}`;
      values = { [`${attr}`]: value };
    }

    return { expression: `${condition} AND `, values };
  }

  private isBeginsWithFilter(filter: FilterTypes): filter is BeginsWithFilter {
    return !!filter && (filter as BeginsWithFilter).$beginsWith !== undefined;
  }

  private isAndOrFilter(filter: FilterParams): filter is AndOrFilter {
    return this.isOrFilter(filter) && Object.keys(filter).length > 1;
  }

  private isOrFilter(filter: FilterParams): filter is OrFilter {
    return filter.$or !== undefined;
  }

  private orFilter(filter: OrFilter): FilterExpression {
    const orFilter = filter.$or.reduce(
      (filterParams, filter) => {
        const { expression, values } = this.orCondition(filter);
        return {
          expression: filterParams.expression.concat(expression),
          values: { ...filterParams.values, ...values }
        };
      },
      { expression: "", values: {} } as FilterExpression
    );
    orFilter.expression = orFilter.expression.slice(0, -4); // trim off the trailing " OR "
    return orFilter;
  }

  private orCondition(andFilter: AndFilter): FilterExpression {
    const andParams = this.filterParams(andFilter);
    const multipleVals = Object.keys(andParams.values).length > 1;
    const expression = multipleVals
      ? `(${andParams.expression}) OR `
      : `${andParams.expression} OR `;

    const values = Object.entries(andParams.values).reduce(
      (obj, [key, val]) => ({ ...obj, [key]: val }),
      {} as FilterExpression["values"]
    );
    return { expression, values };
  }
}

export default QueryBuilder;
