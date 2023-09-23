import Metadata from "../metadata";
import type SingleTableDesign from "../SingleTableDesign";

function Entity<T extends SingleTableDesign>(
  target: new () => T,
  context: ClassDecoratorContext
): void {
  if (context.kind === "class") {
    const tableClassName = Object.getPrototypeOf(target).name;
    Metadata.addEntity(target, tableClassName);
  }
}

export default Entity;
