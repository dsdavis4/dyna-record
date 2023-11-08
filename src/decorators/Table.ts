import Metadata, { type TableMetadataNoKeys } from "../metadata";
import type SingleTableDesign from "../SingleTableDesign";

function Table(props: TableMetadataNoKeys) {
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
