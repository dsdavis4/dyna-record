import Metadata from "../metadata";
import SingleTableDesign from "../SingleTableDesign";

function Entity<T extends SingleTableDesign>(
  target: new () => T,
  context: ClassDecoratorContext
) {
  if (context.kind === "class") {
    const tableName = Object.getPrototypeOf(target).name;
    Metadata.addEntity(target, tableName);
  }
}

export default Entity;
