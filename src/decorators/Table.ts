import Metadata, { type TableMetadataOptions } from "../metadata";
import type SingleTableDesign from "../SingleTableDesign";

function Table(props: TableMetadataOptions) {
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
