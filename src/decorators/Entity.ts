import Metadata from "../metadata";

function Entity(target: Function, context: ClassDecoratorContext) {
  if (context.kind === "class") {
    const tableName = Object.getPrototypeOf(target).name;
    Metadata.addEntity(target.name, tableName);
  }
}

export default Entity;
