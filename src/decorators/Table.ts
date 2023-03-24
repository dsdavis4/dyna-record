import { TABLE_NAME, PRIMARY_KEY, SORT_KEY, DELIMITER } from "../symbols";

interface TableProps {
  name: string;
  primaryKey: string;
  sortKey: string;
  delimiter: string;
}

// TODO could I make is so anything with this reflects single table design?
// That way I only export Table and Model and Attribute decorators?
// And all logic is encapsualted here?
// low priority
function Table(props: TableProps) {
  // TODO make stricter
  return function (target: any, _context: ClassDecoratorContext) {
    Reflect.defineMetadata(TABLE_NAME, props.name, target);
    Reflect.defineMetadata(PRIMARY_KEY, props.primaryKey, target);
    Reflect.defineMetadata(SORT_KEY, props.sortKey, target);
    Reflect.defineMetadata(DELIMITER, props.delimiter, target);
  };
}

export default Table;
