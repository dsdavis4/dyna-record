import Metadata from "../metadata";
import { BelongsToLink } from "../relationships";
import SingleTableDesign from "../SingleTableDesign";
import { Entity } from "../metadata";

function Entity<T extends Entity>(
  // target: typ of SingleTableDesign | typeof BelongsToLink,
  target: T,
  context: ClassDecoratorContext
) {
  if (context.kind === "class") {
    const tableName = Object.getPrototypeOf(target).name;
    Metadata.addEntity(target, tableName);
  }
}

export default Entity;
