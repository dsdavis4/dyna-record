import Metadata, { TableMetadata } from "../metadata";

function Table(props: TableMetadata) {
  return function (target: Function, context: ClassDecoratorContext) {
    if (context.kind === "class") {
      Metadata.addTable(target.name, props);
    }
  };
}

export default Table;
