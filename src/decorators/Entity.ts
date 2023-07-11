import Metadata from "../metadata";

function Entity(target: Function, _context: ClassDecoratorContext) {
  const tableName = Object.getPrototypeOf(target).name;
  Metadata.addEntity(target.name, tableName);
}

export default Entity;
