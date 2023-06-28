import Metadata from "../metadata";
import SingleTableDesign from "../SingleTableDesign";

type ObjectType<T> = { new (): T };

// TODO is this needed? Its more for making sure models are set up right...
interface HasManyProps<T> {
  targetKey: keyof T;
}

function HasMany<T>(
  target: (type?: any) => ObjectType<T>,
  props: HasManyProps<T>
) {
  return (_value: undefined, context: ClassFieldDecoratorContext) => {
    // TODO make function for this? since its copied in Belongsto
    context.addInitializer(function () {
      const entity = Object.getPrototypeOf(this);

      const entityMetadata = Metadata.entities[entity.constructor.name];
      const propertyName = context.name.toString();

      if (!entityMetadata.relationships[propertyName]) {
        entityMetadata.relationships[propertyName] = {
          type: "HasMany",
          propertyName: context.name.toString(),
          target: target() as any,
          targetKey: props.targetKey.toString()
        };
      }
    });
  };
}

export default HasMany;
