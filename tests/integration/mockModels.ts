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
import { type PrimaryKey, type SortKey } from "../../src/types";

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
  public customerId: string;

  @Attribute({ alias: "PaymentMethodId" })
  public paymentMethodId: string;

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
  public paymentMethodId: string;

  @BelongsTo(() => PaymentMethod, { foreignKey: "paymentMethodId" })
  public scale: PaymentMethod;
}

@Entity
class PaymentMethod extends MockTable {
  @Attribute({ alias: "LastFour" })
  public lastFour: string;

  @Attribute({ alias: "CustomerId" })
  public customerId: string;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public customer: Customer;

  @HasMany(() => Order, { targetKey: "paymentMethodId" })
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

  @HasMany(() => Order, { targetKey: "customerId" })
  public orders: Order[];

  @HasMany(() => PaymentMethod, { targetKey: "customerId" })
  public paymentMethods: PaymentMethod[];

  public mockCustomInstanceMethod(): string {
    return `${this.name}-${this.id}`;
  }
}

export { Order, PaymentMethodProvider, PaymentMethod, Customer };
