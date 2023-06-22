import Metadata from "../metadata";

function Entity(target: Function, _context: ClassDecoratorContext) {
  Metadata.entities[target.name] = {
    tableName: Object.getPrototypeOf(target).name,
    attributes: {},
    relationships: {}
  };
}

export default Entity;
