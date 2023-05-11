import Metadata, { TableMetadata } from "../metadata";

function Table(props: TableMetadata) {
  return function (target: Function, _context: ClassDecoratorContext) {
    Metadata.tables[target.name] = props;
  };
}

export default Table;
