import Metadata from "../metadata";

interface TableProps {
  name: string;
  primaryKey: string;
  sortKey: string;
  delimiter: string;
}

export interface TableConstructor {
  readonly tableName: string;
  readonly primaryKey: string;
  readonly sortKey: string;
  readonly delimiter: string;
}

function Table(props: TableProps) {
  return function (target: Function, _context: ClassDecoratorContext) {
    Metadata.tables[target.name] = props;
  };
}

export default Table;
