import SingleTableDesign from "../../src";
import {
  Table,
  Entity,
  PrimaryKeyAttribute,
  SortKeyAttribute,
  Attribute,
  ForeignKeyAttribute,
  HasMany,
  BelongsTo,
  HasOne,
  NullableForeignKeyAttribute
} from "../../src/decorators";
import type {
  PrimaryKey,
  SortKey,
  ForeignKey,
  NullableForeignKey
} from "../../src/types";

@Table({ name: "mock-table", delimiter: "#" })
abstract class MockTable extends SingleTableDesign {
  @PrimaryKeyAttribute({ alias: "PK" })
  public pk: PrimaryKey;

  @SortKeyAttribute({ alias: "SK" })
  public sk: SortKey;
}

@Entity
class Order extends MockTable {
  @ForeignKeyAttribute({ alias: "CustomerId" })
  public customerId: ForeignKey;

  @ForeignKeyAttribute({ alias: "PaymentMethodId" })
  public paymentMethodId: ForeignKey;

  @Attribute({ alias: "OrderDate" })
  public orderDate: Date;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public customer: Customer;

  @BelongsTo(() => PaymentMethod, { foreignKey: "paymentMethodId" })
  public paymentMethod: PaymentMethod;
}

@Entity
class PaymentMethodProvider extends MockTable {
  @Attribute({ alias: "Name" })
  public name: string;

  @ForeignKeyAttribute({ alias: "PaymentMethodId" })
  public paymentMethodId: ForeignKey;

  @BelongsTo(() => PaymentMethod, { foreignKey: "paymentMethodId" })
  public paymentMethod: PaymentMethod;
}

@Entity
class PaymentMethod extends MockTable {
  @Attribute({ alias: "LastFour" })
  public lastFour: string;

  @ForeignKeyAttribute({ alias: "CustomerId" })
  public customerId: ForeignKey;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public customer: Customer;

  @HasMany(() => Order, { foreignKey: "paymentMethodId" })
  public orders: Order[];

  @HasOne(() => PaymentMethodProvider, {
    foreignKey: "paymentMethodId"
  })
  public paymentMethodProvider: PaymentMethodProvider;
}

@Entity
class Customer extends MockTable {
  @Attribute({ alias: "Name" })
  public name: string;

  @Attribute({ alias: "Address" })
  public address: string;

  @HasMany(() => Order, { foreignKey: "customerId" })
  public orders: Order[];

  @HasMany(() => PaymentMethod, { foreignKey: "customerId" })
  public paymentMethods: PaymentMethod[];

  // TODO I need the type system to error if the type is not defined as optional because its linked through a nullable foreign key
  @HasOne(() => ContactInformation, { foreignKey: "customerId" })
  public contactInformation?: ContactInformation;

  public mockCustomInstanceMethod(): string {
    return `${this.name}-${this.id}`;
  }
}

@Entity
class ContactInformation extends MockTable {
  @Attribute({ alias: "Email" })
  public email: string;

  @Attribute({ alias: "Phone" })
  public phone: string;

  @NullableForeignKeyAttribute({ alias: "CustomerId" })
  public customerId: NullableForeignKey;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public customer: Customer;
}

export {
  MockTable,
  Order,
  PaymentMethodProvider,
  PaymentMethod,
  Customer,
  ContactInformation
};
