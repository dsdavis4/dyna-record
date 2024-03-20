// TODO move other metadata types into here.. But do this after migration to decorator built in metadata

import type { RelationshipMetadata } from ".";
import type NoOrm from "../NoOrm";

export type RelationshipMetadataWithForeignKey = Extract<
  RelationshipMetadata,
  { foreignKey: keyof NoOrm }
>;
