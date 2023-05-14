import { QueryCommand, QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import {
  NativeAttributeValue, // TODO should this be used or the one below?...
  NativeScalarAttributeValue // TODO I think I should use this...
} from "@aws-sdk/util-dynamodb";

// TODO should I make the types smart enough to be aware of $beginsWith?

// TODO should some of these functions exlpdcitly set return type to Filter?
// The reason is the auto compile thinks that values is Record<string, any>

type KeyConditions = Omit<QueryCommandInput["KeyConditions"], "undefined">;

interface Filter {
  values: Record<string, NativeScalarAttributeValue>; // TODO should this be FilterParams?
  expression: string;
}

// type FilterValue =
//   | Record<string, NativeScalarAttributeValue>
//   | Record<string, NativeScalarAttributeValue[]>;

type FilterValue = Record<
  string,
  NativeScalarAttributeValue | NativeScalarAttributeValue[]
>;

// Filter value that does not have an '$or' key
type AndFilter = FilterValue & { $or?: never };
type OrFilter = Record<"$or", FilterValue[]>;
type FilterParams = AndFilter | OrFilter;

// TODO delete this, its just to show AndFilter type works
// const bla: AndFilter = {
//   $or: [
//     { status: "active" },
//     { name: "ReadKegData", status: ["complete", "canceled"] }
//   ],
//   type: "Process",
//   status: ["complete", "canceled"]
// };

interface QueryCommandProps {
  // entity: typeof DynamoBase;
  key: KeyConditions;
  // TODO should this be optional?
  // TODO make it so at least one of the params is required
  // TODO should filter be optional?
  options: { indexName?: string; filter: FilterParams };
}

// TODO should this be called query builder?
// TODO should I add explicit returns for all these functions?
class QueryParams {
  // private readonly doc: Record<string, NativeAttributeValue>;
  private attrCounter: number;

  constructor(private props: QueryCommandProps) {
    this.props = props;
    // this.doc = props.entity.toDocument(props.key);
    this.attrCounter = 0;
  }

  // TODO should this be called build?
  public get(): QueryCommand {
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
  private filterParams(filter: FilterParams): Filter {
    const { $or: orFilters } = filter;

    if (orFilters) {
      const multipleFilters = Object.keys(filter).length > 1;
      return multipleFilters ? this.andOrFilter(filter) : this.orFilter(filter);
    } else {
      return this.andFilter(filter);
    }
  }

  private andOrFilter(filter: FilterParams): Filter {
    const { $or: orFilters, ...andFilters } = filter;
    const orFilterParams = this.orFilter(filter);
    const andFilterParams = this.andFilter(andFilters);
    const expression = `(${orFilterParams.expression}) AND (${andFilterParams.expression})`;
    const values = { ...orFilterParams.values, ...andFilterParams.values };
    return { expression, values };
  }

  private andFilter(filter: KeyConditions | AndFilter): Filter {
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

  private andCondition(attr: string, value: NativeAttributeValue): Filter {
    // const doc = this.props.entity.toDocument({ [attr]: value });
    const doc = {}; // TODO reference metadata, annd/or store attribute classes on metadata...
    const docAttribute = Object.keys(doc)[0];

    let condition;
    let values: Record<string, NativeAttributeValue> = {};
    if (Array.isArray(value)) {
      const mappings = value.reduce((acc, value) => {
        const attr = `${docAttribute}${++this.attrCounter}`;
        values[attr] = value;
        return acc.concat(`:${attr}`);
      }, [] as string[]);
      condition = `#${docAttribute} IN (${mappings.join()})`;
    } else if (value.$beginsWith) {
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

  // TODO should this type be OrFilter?
  private orFilter(filter: FilterParams): Filter {
    const { $or: orFilters = [] } = filter;

    // TODO start here....
    // NativeScalarAttributeValue or NativeAttributeValue

    // https://github.com/microsoft/TypeScript/issues/44063
    const orFilter = orFilters.reduce(
      (filterParams, filter) => {
        const { expression, values } = this.orCondition(filter);
        return {
          expression: filterParams.expression.concat(expression),
          values: { ...filterParams.values, ...values }
        };
      },
      { expression: "", values: {} } as Filter
    );
    orFilter.expression = orFilter.expression.slice(0, -4); // trim off the trailing " OR "
    return orFilter;
  }

  private orCondition(andFilter: Record<string, NativeAttributeValue>): Filter {
    const andParams = this.filterParams(andFilter);
    const multipleVals = Object.keys(andParams.values).length > 1;
    const expression = multipleVals
      ? `(${andParams.expression}) OR `
      : `${andParams.expression} OR `;

    const values = Object.entries(andParams.values).reduce(
      (obj, [key, val]) => {
        const current = obj[key];
        const currentExists = !!obj[key];
        const isArray = Array.isArray(current);

        const toArray = () => (isArray ? current.concat(val) : [current, val]);
        const newVal = currentExists ? toArray() : val;

        return { ...obj, [key]: newVal };
      },
      {} as Record<string, NativeAttributeValue>
    );
    return { expression, values };
  }
}

export default QueryParams;
