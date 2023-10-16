import { type NativeAttributeValue } from "@aws-sdk/util-dynamodb";
import Metadata, { type TableMetadata } from "../metadata";
import { BelongsToLink } from "../relationships";
import { DynamoTableItem } from "../types";
import { AttributeValue } from "@aws-sdk/client-dynamodb";
import SingleTableDesign from "../SingleTableDesign";

// TODO this is duplicated
type StringObj = Record<string, string>;

interface ExpressionBuilderProps {
  entityClassName: string;
}

class ExpressionBuilder {
  // TODO tsdoc on all attributes and functions...

  protected attrCounter: number;
  protected readonly tableMetadata: TableMetadata;

  // Lookup tableKey by modelKey: ex: { modelProp1: :"ModelProp1", modelProp2: :"ModelProp2" }
  protected readonly tableKeyLookup: StringObj;

  constructor(private readonly props: ExpressionBuilderProps) {
    this.props = props;
    this.attrCounter = 0;

    const entityMetadata = Metadata.getEntity(props.entityClassName);
    this.tableMetadata = Metadata.getTable(entityMetadata.tableClassName);

    const possibleAttrs = {
      ...entityMetadata.attributes,
      ...Metadata.getEntity(BelongsToLink.name).attributes
    };

    this.tableKeyLookup = Object.entries(possibleAttrs).reduce<StringObj>(
      (acc, [tableKey, attrMetadata]) => {
        acc[attrMetadata.name] = tableKey;
        return acc;
      },
      {}
    );
  }
}

export default ExpressionBuilder;
