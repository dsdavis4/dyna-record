/* eslint-disable @typescript-eslint/no-unused-vars */
import DynaRecord from "../../index.js";
import {
  Table,
  Entity,
  PartitionKeyAttribute,
  SortKeyAttribute,
  StringAttribute,
  NumberAttribute,
  ForeignKeyAttribute,
  HasMany,
  BelongsTo,
  Searchable,
  SearchFilterable
} from "../../src/decorators/index.js";
import {
  FilterExpressionBuilder,
  searchFilterAttributeResolver,
  searchFilterCapabilities,
  type SearchFilterParams
} from "../../src/filter-utils/index.js";
import { FilterError } from "../../src/errors.js";
import { TitanTextEmbedV2 } from "../../src/embedding/types.js";
import type {
  ForeignKey,
  PartitionKey,
  Searchable as SearchableText,
  SearchFilterable as Filterable,
  SortKey
} from "../../src/types.js";
import {
  storeSearchIndex,
  Listing,
  Review
} from "../integration/mockModels.js";

const mockProvider = (_text: string): Promise<number[]> =>
  Promise.resolve(new Array<number>(TitanTextEmbedV2.dimensions).fill(0.1));

@Table({
  name: "filter-search-table",
  defaultFields: {
    id: { alias: "Id" },
    type: { alias: "Type" },
    createdAt: { alias: "CreatedAt" },
    updatedAt: { alias: "UpdatedAt" }
  }
})
abstract class FilterSearchTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class Shop extends FilterSearchTable {
  declare readonly type: "Shop";

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @HasMany(() => Product, { foreignKey: "shopId" })
  public readonly products: Product[];
}

@Entity
class Product extends FilterSearchTable {
  declare readonly type: "Product";

  @Searchable()
  @StringAttribute({ alias: "Description" })
  public readonly description: SearchableText;

  @SearchFilterable()
  @StringAttribute({ alias: "Category" })
  public readonly category: Filterable;

  @SearchFilterable()
  @NumberAttribute({ alias: "Price" })
  public readonly price: Filterable<number>;

  @SearchFilterable()
  @ForeignKeyAttribute(() => Shop, { alias: "ShopId" })
  public readonly shopId: Filterable<ForeignKey<Shop>>;

  @BelongsTo(() => Shop, { foreignKey: "shopId" })
  public readonly shop: Shop;
}

const productSearchIndex = FilterSearchTable.vectorIndex({
  name: "product-search-index",
  model: TitanTextEmbedV2,
  provider: mockProvider,
  scopedBy: () => Shop
});

const searchBuilderInstance = (): FilterExpressionBuilder =>
  new FilterExpressionBuilder({
    capabilities: searchFilterCapabilities,
    resolveAttribute: searchFilterAttributeResolver(productSearchIndex)
  });

describe("searchFilterAttributeResolver", () => {
  it("compiles equality conditions on declared @SearchFilterable attributes joined by AND with every name aliased", () => {
    expect.assertions(2);

    const builder = searchBuilderInstance();
    const filter = { category: "books", price: 10, shopId: "123" };

    expect(builder.filterParams(filter)).toEqual({
      expression:
        "#Category = :Category1 AND #Price = :Price2 AND #ShopId = :ShopId3",
      values: { Category1: "books", Price2: 10, ShopId3: "123" }
    });
    expect(builder.expressionAttributeNames([], filter)).toEqual({
      "#Category": "Category",
      "#Price": "Price",
      "#ShopId": "ShopId"
    });
  });

  it("rejects a second condition on an attribute already conditioned through the same builder instance", () => {
    expect.assertions(2);

    // The scoping foreign key shape: the search operation conditions the
    // index HASH, then a consumer filter targets the same attribute
    const builder = searchBuilderInstance();
    builder.filterParams({ shopId: "123" });

    expect(() => builder.filterParams({ shopId: "456" })).toThrowError(
      FilterError
    );
    expect(() => builder.filterParams({ shopId: "456" })).toThrowError(
      'search filters support a single condition per attribute. Attribute "shopId" has more than one condition'
    );
  });

  it("rejects a filter key that is not a declared @SearchFilterable attribute of the searched members", () => {
    expect.assertions(2);

    const builder = searchBuilderInstance();

    expect(() => builder.filterParams({ name: "test" })).toThrowError(
      FilterError
    );
    expect(() => builder.filterParams({ name: "test" })).toThrowError(
      'Invalid search filter key "name": attribute "name" is not declared @SearchFilterable on the members of vector index product-search-index. Filterable attributes are: category, price, shopId'
    );
  });

  it("rejects filtering on the searchable text attribute", () => {
    expect.assertions(1);

    const builder = searchBuilderInstance();

    expect(() => builder.filterParams({ description: "test" })).toThrowError(
      'Invalid search filter key "description": attribute "description" is not declared @SearchFilterable on the members of vector index product-search-index. Filterable attributes are: category, price, shopId'
    );
  });

  it("rejects the type discriminator, which belongs to the search in option", () => {
    expect.assertions(2);

    const builder = searchBuilderInstance();

    expect(() => builder.filterParams({ type: "Product" })).toThrowError(
      FilterError
    );
    expect(() => builder.filterParams({ type: "Product" })).toThrowError(
      'Invalid search filter key "type": the "type" discriminator cannot be filtered on directly. Narrow a search to specific entities with the "in" option'
    );
  });

  it("rejects a value whose shape violates the attribute's registered zod type", () => {
    expect.assertions(2);

    const builder = searchBuilderInstance();

    expect(() => builder.filterParams({ price: "cheap" })).toThrowError(
      FilterError
    );
    expect(() => builder.filterParams({ price: "cheap" })).toThrowError(
      'Invalid filter value for attribute "price": the value does not match the attribute\'s type'
    );
  });

  it("rejects a nested operator object where a scalar is expected", () => {
    expect.assertions(2);

    const builder = searchBuilderInstance();

    expect(() => builder.filterParams({ category: { $gt: "a" } })).toThrowError(
      FilterError
    );
    expect(() => builder.filterParams({ category: { $gt: "a" } })).toThrowError(
      'Invalid filter value for attribute "category": the value does not match the attribute\'s type'
    );
  });

  it("rejects unsupported operators before resolving values", () => {
    expect.assertions(4);

    const builder = searchBuilderInstance();

    expect(() =>
      builder.filterParams({ $or: [{ category: "books" }] })
    ).toThrowError("$or conditions are not supported in search filters");
    expect(() =>
      builder.filterParams({ category: ["books", "movies"] })
    ).toThrowError(
      'IN conditions (array values) are not supported in search filters. Attribute "category" has an array value'
    );
    expect(() =>
      builder.filterParams({ category: { $beginsWith: "boo" } })
    ).toThrowError(
      '$beginsWith conditions are not supported in search filters. Attribute "category" has a $beginsWith condition'
    );
    expect(() =>
      builder.filterParams({ category: { $contains: "boo" } })
    ).toThrowError(
      '$contains conditions are not supported in search filters. Attribute "category" has a $contains condition'
    );
  });

  it("resolves filterable attributes across every member entity of an index", () => {
    expect.assertions(1);

    // storeSearchIndex members are Listing (category filterable) and Review
    // (no filterables) — Listing's declaration is visible through the index
    const builder = new FilterExpressionBuilder({
      capabilities: searchFilterCapabilities,
      resolveAttribute: searchFilterAttributeResolver(storeSearchIndex)
    });

    expect(builder.filterParams({ category: "books" })).toEqual({
      expression: "#Category = :Category1",
      values: { Category1: "books" }
    });
  });

  describe("types", () => {
    it("accepts scalar equality values for filterable attributes", () => {
      // @ts-expect-no-error: scalar equality on member attributes
      const filter: SearchFilterParams<Product> = {
        category: "books",
        price: 10,
        shopId: "123"
      };

      expect(filter).toBeDefined();
    });

    it("rejects non-equality filter shapes and undeclared attributes at compile time", () => {
      // @ts-expect-error: the type discriminator belongs to the search in option
      const typeFilter: SearchFilterParams<Product> = { type: "Product" };

      const orFilter: SearchFilterParams<Product> = {
        // @ts-expect-error: $or blocks are not supported in search filters
        $or: [{ category: "books" }]
      };

      const beginsWithFilter: SearchFilterParams<Product> = {
        // @ts-expect-error: $beginsWith conditions are not supported in search filters
        category: { $beginsWith: "boo" }
      };

      const containsFilter: SearchFilterParams<Product> = {
        // @ts-expect-error: $contains conditions are not supported in search filters
        category: { $contains: "boo" }
      };

      const inFilter: SearchFilterParams<Product> = {
        // @ts-expect-error: IN conditions (array values) are not supported in search filters
        category: ["books", "movies"]
      };

      const nestedOperatorFilter: SearchFilterParams<Product> = {
        // @ts-expect-error: nested operator objects are not valid scalar values
        price: { $gt: 10 }
      };

      const unknownAttributeFilter: SearchFilterParams<Product> = {
        // @ts-expect-error: someUnknownAttribute is not an attribute of the searched members
        someUnknownAttribute: "test"
      };

      const unbrandedScalarFilter: SearchFilterParams<Product> = {
        // @ts-expect-error: id is a scalar attribute but carries no SearchFilterable brand — only declared filterables are filter keys
        id: "123"
      };

      const searchableAttributeFilter: SearchFilterParams<Product> = {
        // @ts-expect-error: the searchable text attribute is embedded, never equality-filtered
        description: "test"
      };

      expect(true).toBe(true);
    });

    it("scopes filter keys to the searched member entities", () => {
      // @ts-expect-no-error: category is an attribute of the Listing member
      const memberFilter: SearchFilterParams<Listing | Review> = {
        category: "books"
      };

      const nonMemberFilter: SearchFilterParams<Listing | Review> = {
        // @ts-expect-error: name is not an attribute of the searched members
        name: "test"
      };

      expect(memberFilter).toBeDefined();
    });
  });
});
