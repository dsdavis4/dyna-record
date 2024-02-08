import type SingleTableDesign from "../SingleTableDesign";
import Metadata from "../metadata";
import type { NullableForeignKey } from "../types";

// TODO do I need to do something to handle anything in here so that if a NullableForeignKey is "included" on that tht type system knows that the return value might not be defined...
// EX:
// // In below, res.process should be known that it might return undefined because process is nullbable forieng key
//  //  And also should  do empty array for nulable on HasMany
// const res = Scale.findById("123", {include: [{association: "process"}]})

interface NullableForeignKeyAttributeProps {
  alias: string;
}

// TODO... Since I started, typescript released metadata property of deraotrs. Can I use it?
//        https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#decorator-metadata

// TODO dry up with ForeignKeyAttribute
function NullableForeignKeyAttribute<T>(
  props: NullableForeignKeyAttributeProps
) {
  return function (
    _value: undefined,
    context: ClassFieldDecoratorContext<T, NullableForeignKey>
  ) {
    if (context.kind === "field") {
      context.addInitializer(function () {
        const entity: SingleTableDesign = Object.getPrototypeOf(this);

        Metadata.addEntityAttribute(entity.constructor.name, {
          attributeName: context.name.toString(),
          alias: props.alias,
          nullable: true
        });
      });
    }
  };
}

export default NullableForeignKeyAttribute;
