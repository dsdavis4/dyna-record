import Metadata, { type TableMetadataOptions } from "../metadata";
import type NoOrm from "../NoOrm";

function Table(props: TableMetadataOptions) {
  return function (target: typeof NoOrm, context: ClassDecoratorContext) {
    if (context.kind === "class") {
      Metadata.addTable(target.name, props);
    }
  };
}

export default Table;
