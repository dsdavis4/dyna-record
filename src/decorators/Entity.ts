import { ENTITY_TYPE, ENTITY_ATTRIBUTES } from "../symbols";
import EntityMixin from "../mixins/Entity";

// TODO  make stricter
type GConstructor<T = {}> = new (...args: any[]) => T;

interface Entity {
  attributes(): string[];
}

function Entity(name: string) {
  return function <T extends GConstructor>(
    target: T,
    _context: ClassDecoratorContext
  ) {
    // TODO should this be changed /moved to Reflect.defineMetadata(ENTITY_TYPE, name, Entity);
    Reflect.defineMetadata(ENTITY_TYPE, name, target);

    // You can define other decorators here
    class Entity extends EntityMixin(target) {}

    // Apply original class descriptors to the new class
    const ownPropertyDescriptors = Object.getOwnPropertyDescriptors(target);

    const { prototype, ...descriptors } = ownPropertyDescriptors;

    Object.defineProperties(Entity, descriptors);

    return Entity as T;
  };
}

// TODO example not using mixin
// function Entity(name: string) {
//   const _this = this;

//   return function <T extends GConstructor>(
//     target: T,
//     context: ClassDecoratorContext
//   ) {
//     if (context.kind === "class") {
//       Reflect.defineMetadata(ENTITY_TYPE, name, target);

//       const Entity = class extends target {
//         constructor(...args: any[]) {
//           super(args);
//         }
//         serialize(tableItem: Record<string, any>): Record<string, any> {
//           let target = Object.getPrototypeOf(this);
//           const attrs: Record<string, string> = Reflect.getOwnMetadata(
//             ENTITY_ATTRIBUTES,
//             target
//           );

//           const bla = _this;
//           debugger;

//           Object.entries(tableItem).forEach(([attr, value]) => {
//             const entityKey = attrs[attr];
//             target[`${entityKey}`] = value;
//           }, {});

//           debugger;
//           return target;
//         }
//       };
//       Entity.prototype = target.prototype; // (A)
//       return Entity;
//     }
//     debugger;
//     return target; // TODO is this needed?
//   };
// }

export default Entity;
