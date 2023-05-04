import { ENTITY_TYPE, ENTITY_ATTRIBUTES } from "../symbols";
import EntityMixin from "../mixins/Entity";
import Metadata from "../metadata";

import { TableConstructor } from "./Table";

// TODO  make stricter, and this is duplicated
type GConstructor<T = {}> = new (...args: any[]) => T;

interface Entity {
  attributes(): string[];
}

// function Entity(name: string) {
//   return function <T extends GConstructor>(
//     target: T,
//     _context: ClassDecoratorContext
//   ) {
//     const tableName = Object.getPrototypeOf(target).name;

//     // TODO find better way to init
//     Metadata.entities[name] = { tableName, attributes: {} };

//     // You can define other decorators here
//     class Entity extends EntityMixin(target) {}

//     // Apply original class descriptors to the new class
//     const ownPropertyDescriptors = Object.getOwnPropertyDescriptors(target);

//     const { prototype, ...descriptors } = ownPropertyDescriptors;

//     Object.defineProperties(Entity, descriptors);

//     return Entity as T;
//   };
// }

// TODO might not need name... should use class name
function Entity(target: Function, _context: ClassDecoratorContext) {
  // TODO make stricter
  // TODO set the type correctly
  // return function (target: Function, _context: ClassDecoratorContext) {
  //   const tableName = Object.getPrototypeOf(target).name;
  //   // TODO find better way to init
  //   Metadata.entities[name] = { tableName, attributes: {} };
  // };

  // const _this = this;
  // debugger;
  // const wrapper = function (...args: any[]) {
  //   debugger;
  // };
  // let instanceCount = 0;
  // // The wrapper must be new-callable
  // const wrapper = function (...args) {
  //   instanceCount++;
  //   const instance = new target(...args);
  //   // Change the instance
  //   instance.count = instanceCount;
  //   return instance;
  // };
  // wrapper.prototype = target.prototype; // (A)

  Metadata.entities[target.name] = {
    // tableName: target.tableName,
    tableName: Object.getPrototypeOf(target).name,
    attributes: {}
  };
  debugger;
  return this;
}

// TODO example not using mixin
// TODO might not need name... should use class name
// function Entity(name: string) {
//   const _this = this;

//   return function <T extends GConstructor>(
//     target: T,
//     context: ClassDecoratorContext
//   ) {
//     if (context.kind === "class") {
//       const tableName = Object.getPrototypeOf(target).name;

//       // TODO find better way to init
//       Metadata.entities[name] = { tableName, attributes: {} };

//       // TODO is any of this needed?
//       const Entity = class extends target {
//         constructor(...args: any[]) {
//           super(args);
//         }
//         // serialize(tableItem: Record<string, any>): Record<string, any> {
//         //   let target = Object.getPrototypeOf(this);
//         //   debugger;
//         //   const attrs: Record<string, string> = Reflect.getOwnMetadata(
//         //     ENTITY_ATTRIBUTES,
//         //     target
//         //   );

//         //   const bla = _this;
//         //   debugger;

//         //   Object.entries(tableItem).forEach(([attr, value]) => {
//         //     const entityKey = attrs[attr];
//         //     target[`${entityKey}`] = value;
//         //   }, {});

//         //   debugger;
//         //   return target;
//         // }
//       };
//       debugger;
//       // Entity.prototype = target.prototype; // (A)
//       return Entity;
//     }
//     debugger;
//     return target; // TODO is this needed?
//   };
// }

export default Entity;
