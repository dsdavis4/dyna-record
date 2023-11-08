import SingleTableDesign from "../../src";
import {
  Table,
  Entity,
  PrimaryKeyAttribute,
  SortKeyAttribute,
  Attribute,
  HasMany,
  BelongsTo,
  HasOne
} from "../../src/decorators";
import type { PrimaryKey, SortKey, ForeignKey } from "../../src/types";

@Table({ name: "mock-table", delimiter: "#" })
abstract class MockTable extends SingleTableDesign {
  @PrimaryKeyAttribute({ alias: "PK" })
  public pk: PrimaryKey;

  @SortKeyAttribute({ alias: "SK" })
  public sk: SortKey;
}

@Entity
class Order extends MockTable {
  @Attribute({ alias: "CustomerId" })
  public customerId: ForeignKey;

  @Attribute({ alias: "PaymentMethodId" })
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

  @Attribute({ alias: "PaymentMethodId" })
  public paymentMethodId: ForeignKey;

  @BelongsTo(() => PaymentMethod, { foreignKey: "paymentMethodId" })
  public paymentMethod: PaymentMethod;
}

@Entity
class PaymentMethod extends MockTable {
  @Attribute({ alias: "LastFour" })
  public lastFour: string;

  @Attribute({ alias: "CustomerId" })
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

  @Attribute({ alias: "CustomerId" })
  public customerId: ForeignKey;

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
