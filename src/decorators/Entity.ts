import Metadata from "../metadata";
import type NoOrm from "../NoOrm";

function Entity<T extends NoOrm>(
  target: new () => T,
  context: ClassDecoratorContext
): void {
  if (context.kind === "class") {
    const tableClassName: string = Object.getPrototypeOf(target).name;
    Metadata.addEntity(target, tableClassName);
  }
}

export default Entity;
