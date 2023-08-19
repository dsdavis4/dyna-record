import Metadata from "../metadata";
import SingleTableDesign from "../SingleTableDesign";

function Entity<T extends SingleTableDesign>(
  target: new () => T,
  context: ClassDecoratorContext
) {
  if (context.kind === "class") {
    const tableClassName = Object.getPrototypeOf(target).name;
    Metadata.addEntity(target, tableClassName);
  }
}

export default Entity;
