import type DynaRecord from "../../DynaRecord.js";
import Metadata from "../../metadata/index.js";
import type {
  Optional,
  SearchFilterable as SearchFilterableBrand
} from "../../types.js";

/**
 * Local alias so the decorator and the brand can share the exported
 * `SearchFilterable` name — the single `export { SearchFilterable }` below
 * carries both the value (decorator) and type (brand) meanings.
 */
type SearchFilterable<T extends Optional<string | number | boolean> = string> =
  SearchFilterableBrand<T>;

/**
 * A layered decorator declaring an attribute as an inline filter on the
 * vector indexes containing the entity. Stack it over any attribute
 * decorator; the base decorator continues to own the attribute's alias,
 * nullability, and validation — `@SearchFilterable()` only adds the
 * filterable mark.
 *
 * Foreign key attributes are valid filterables — filtering on a foreign key
 * is the mechanism for narrowing a search within a scope. Nullable
 * attributes compose: brand the optional form of the underlying type
 * (EX: `SearchFilterable<NullableForeignKey<Brand>>`); rows where the
 * attribute is absent never match an equality filter on it.
 *
 * IMPORTANT! - One inline filter is one table attribute: a filterable
 * property must resolve to the same table alias across every member entity of
 * an index, and an index supports at most 18 inline filters counting the
 * entity type filter the library declares automatically. Both rules are
 * enforced at metadata initialization.
 *
 * @template T The entity the decorator is applied to, extending {@link DynaRecord}.
 * @template K The type of the decorated property.
 * @returns A class field decorator function that registers the filterable mark
 * with the ORM's metadata system, reconciled at metadata initialization.
 *
 * Usage example:
 * ```typescript
 * @Entity
 * class Listing extends MyTable {
 *   declare readonly type: "Listing";
 *
 *   @SearchFilterable()
 *   @StringAttribute({ alias: "Category" })
 *   public readonly category: string;
 *
 *   @SearchFilterable()
 *   @ForeignKeyAttribute(() => Store, { alias: "StoreId" })
 *   public readonly storeId: ForeignKey<Store>;
 * }
 * ```
 */
function SearchFilterable<
  T extends DynaRecord,
  K extends Optional<SearchFilterableBrand<string | number | boolean>>
>() {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    context.addInitializer(function (this: T) {
      Metadata.addFilterableAttribute(
        this.constructor.name,
        context.name.toString()
      );
    });
  };
}

export { SearchFilterable };
