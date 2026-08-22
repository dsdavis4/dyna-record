import type DynaRecord from "../../DynaRecord.js";
import Metadata from "../../metadata/index.js";
import type { Optional, Searchable as SearchableBrand } from "../../types.js";

/**
 * Local alias so the decorator and the brand can share the exported
 * `Searchable` name — the single `export { Searchable }` below carries both
 * the value (decorator) and type (brand) meanings.
 */
type Searchable<T extends string = string> = SearchableBrand<T>;

/**
 * A layered decorator marking a string attribute as the entity's searchable
 * text for vector search. Stack it over a string attribute decorator; the
 * base decorator continues to own the attribute's alias, nullability, and
 * validation — `@Searchable()` only adds the searchable mark.
 *
 * The decorated property must carry the {@link SearchableBrand | Searchable}
 * brand — applying the decorator to a plain `string` property is a compile
 * error. The brand alone confers nothing; without the decorator the attribute
 * is a normal string attribute.
 *
 * IMPORTANT! - An entity may declare at most one searchable attribute. This
 * is enforced at metadata initialization, together with the requirement that
 * the layered-over attribute is a string attribute.
 *
 * @template T The entity the decorator is applied to, extending {@link DynaRecord}.
 * @template K The type of the decorated property, which must carry the `Searchable` brand.
 * @returns A class field decorator function that registers the searchable mark
 * with the ORM's metadata system, reconciled at metadata initialization.
 *
 * Usage example:
 * ```typescript
 * @Entity
 * class Listing extends MyTable {
 *   declare readonly type: "Listing";
 *
 *   @Searchable()
 *   @StringAttribute({ alias: "Description" })
 *   public readonly description: Searchable;
 *
 *   @Searchable()
 *   @StringAttribute({ alias: "Summary", nullable: true })
 *   public readonly summary?: Searchable; // nullable variant
 * }
 * ```
 */
function Searchable<
  T extends DynaRecord,
  K extends Optional<SearchableBrand>
>() {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, K>
  ) {
    context.addInitializer(function (this: T) {
      Metadata.addSearchableAttribute(
        this.constructor.name,
        context.name.toString()
      );
    });
  };
}

export { Searchable };
