// TODO move other metadata types into here.. But do this after migration to decorator built in metadata

import type { RelationshipMetadata } from ".";
import type SingleTableDesign from "../SingleTableDesign";

export type RelationshipMetadataWithForeignKey = Extract<
  RelationshipMetadata,
  { foreignKey: keyof SingleTableDesign }
>;
