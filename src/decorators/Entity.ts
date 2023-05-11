import Metadata from "../metadata";

interface Entity {
  attributes(): string[];
}

function Entity(target: Function, _context: ClassDecoratorContext) {
  Metadata.entities[target.name] = {
    tableName: Object.getPrototypeOf(target).name,
    attributes: {}
  };

  return this;
}

export default Entity;
