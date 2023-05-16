import { QueryCommand, QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import { NativeScalarAttributeValue } from "@aws-sdk/util-dynamodb";

type KeyConditions = Omit<QueryCommandInput["KeyConditions"], "undefined">;

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
type OrFilter = Record<"$or", AndFilter[]>;
type FilterParams = AndFilter | OrFilter;

type AndOrFilter = FilterParams & OrFilter;

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

interface QueryCommandProps {
  // entity: typeof DynamoBase;
  key: KeyConditions;
  // TODO should this be optional?
  // TODO make it so at least one of the params is required
  // TODO should filter be optional?
  options: { indexName?: string; filter: FilterParams };
}

// TODO should I add explicit returns for all these functions?
class QueryBuilder {
  // private readonly doc: Record<string, NativeAttributeValue>;
  private attrCounter: number;

  constructor(private props: QueryCommandProps) {
    this.props = props;
    // this.doc = props.entity.toDocument(props.key);
    this.attrCounter = 0;
  }

  // TODO should this be called build?
  public build(): QueryCommand {
    const { indexName, filter } = this.props.options;
    const filterParams = filter && this.filterParams(filter);

    const keyFilter = this.andFilter(this.props.key);

    return new QueryCommand({
      // TODO
      TableName: "drews-brews",
      // TableName: this.props.entity.tableName,
      ...(indexName && { IndexName: indexName }),
      ...(filter && { FilterExpression: filterParams.expression }),
      KeyConditionExpression: keyFilter.expression
      // TODO
      // ExpressionAttributeNames: this.expressionAttributeNames(),
      // ExpressionAttributeValues: this.expressionAttributeValueParams(
      //   keyFilter,
      //   filterParams
      // )
    });
  }

  // private expressionAttributeValueParams(
  //   keyParams: Filter,
  //   filterParams: Filter
  // ): Record<string, NativeAttributeValue> {
  //   const valueParams = this.props.options.filter
  //     ? { ...keyParams.values, ...filterParams.values }
  //     : keyParams.values;

  //   return this.props.entity.expressionAttributeValues(valueParams);
  // }

  // private expressionAttributeNames(): Record<string, string> {
  //   const { filter } = this.props.options;
  //   let filterAttributeNames = {};
  //   if (filter) {
  //     const { $or: orFilters, ...andFilters } = filter;

  //     const or =
  //       orFilters &&
  //       orFilters.reduce(
  //         (attrNames, model) => ({
  //           ...attrNames,
  //           ...this.props.entity.toDocument(model)
  //         }),
  //         {}
  //       );

  //     const and = andFilters ? this.props.entity.toDocument(andFilters) : {};

  //     filterAttributeNames = { ...or, ...and };
  //   }

  //   const nameParams = { ...this.doc, ...filterAttributeNames };
  //   return this.props.entity.expressionAttributeNames(nameParams);
  // }

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
    // const doc = this.props.entity.toDocument({ [attr]: value });
    const doc = {}; // TODO reference metadata, annd/or store attribute classes on metadata...
    const docAttribute = Object.keys(doc)[0];

    let condition;
    let values: Record<string, NativeScalarAttributeValue> = {};
    if (Array.isArray(value)) {
      const mappings = value.reduce((acc, value) => {
        const attr = `${docAttribute}${++this.attrCounter}`;
        values[attr] = value;
        return acc.concat(`:${attr}`);
      }, [] as string[]);
      condition = `#${docAttribute} IN (${mappings.join()})`;
    } else if (this.isBeginsWithFilter(value)) {
      const attr = `${docAttribute}${++this.attrCounter}`;
      condition = `begins_with(#${docAttribute}, :${attr})`;
      values = { [`${attr}`]: value.$beginsWith };
    } else {
      const attr = `${docAttribute}${++this.attrCounter}`;
      condition = `#${docAttribute} = :${attr}`;
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
