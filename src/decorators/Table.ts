import Metadata, { type TableMetadata } from "../metadata";
import type SingleTableDesign from "../SingleTableDesign";

function Table(props: TableMetadata) {
  return function (
    target: typeof SingleTableDesign,
    context: ClassDecoratorContext
  ) {
    if (context.kind === "class") {
      Metadata.addTable(target.name, props);
    }
  };
}

export default Table;
