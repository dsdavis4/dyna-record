#!/usr/bin/env node
// Captures the runtime shape of a built package entry as JSON.
// Used to diff pre- and post-upgrade builds for API stability (R13).
//
// Usage: node scripts/runtime-shape-snapshot.cjs <path-to-built-entry>
// Example: node scripts/runtime-shape-snapshot.cjs ./dist/index.js
// Example: node scripts/runtime-shape-snapshot.cjs ./dist/cjs/index.cjs

const path = require("path");

const targetArg = process.argv[2];
if (!targetArg) {
  console.error("Usage: node scripts/runtime-shape-snapshot.cjs <path-to-built-entry>");
  process.exit(1);
}

const targetPath = path.resolve(process.cwd(), targetArg);
const mod = require(targetPath);

const isPlainData = (descriptor) =>
  descriptor !== undefined &&
  "value" in descriptor &&
  !("get" in descriptor) &&
  !("set" in descriptor);

const describeValue = (value) => {
  const type = typeof value;
  if (type === "function") {
    const proto = value.prototype;
    return {
      type,
      name: value.name,
      length: value.length,
      hasPrototype: proto !== undefined && proto !== null,
      staticOwn:
        proto !== undefined && proto !== null
          ? Object.getOwnPropertyNames(value).sort()
          : null,
      prototypeOwn:
        proto !== undefined && proto !== null
          ? Object.getOwnPropertyNames(proto).sort()
          : null,
    };
  }
  if (type === "object" && value !== null) {
    return {
      type,
      constructor: value.constructor ? value.constructor.name : null,
      ownKeys: Object.getOwnPropertyNames(value).sort(),
    };
  }
  return { type };
};

const describeModule = (m) => {
  const keys = Object.keys(m).sort();
  const descriptors = {};
  const exports = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(m, key);
    descriptors[key] = {
      shape: isPlainData(descriptor) ? "data" : "accessor",
      enumerable: descriptor ? descriptor.enumerable : null,
      configurable: descriptor ? descriptor.configurable : null,
    };
    exports[key] = describeValue(m[key]);
  }
  return { keys, descriptors, exports };
};

const snapshot = {
  target: targetArg,
  __esModule: mod.__esModule === true ? true : mod.__esModule === false ? false : undefined,
  module: describeModule(mod),
  default:
    mod.default !== undefined
      ? {
          present: true,
          ...describeValue(mod.default),
          ...(typeof mod.default === "object" && mod.default !== null
            ? { module: describeModule(mod.default) }
            : {}),
        }
      : { present: false },
};

console.log(JSON.stringify(snapshot, null, 2));
