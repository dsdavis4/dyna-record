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
  NullableForeignKeyAttribute,
  NullableAttribute
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

  @NullableAttribute({ alias: "Phone" })
  public phone?: string;

  @NullableForeignKeyAttribute({ alias: "CustomerId" })
  public customerId: NullableForeignKey;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public customer: Customer;
}

@Entity
class Person extends MockTable {
  @Attribute({ alias: "Name" })
  public name: string;

  @HasMany(() => Pet, { foreignKey: "ownerId" })
  public pets: Pet[];

  @HasOne(() => Home, { foreignKey: "personId" })
  public home: Home;
}

@Entity
class Pet extends MockTable {
  @Attribute({ alias: "Name" })
  public name: string;

  @NullableForeignKeyAttribute({ alias: "OwnerId" })
  public ownerId?: NullableForeignKey;

  @BelongsTo(() => Person, { foreignKey: "ownerId" })
  public owner?: Person;
}

@Entity
class Home extends MockTable {
  @Attribute({ alias: "MLS#" })
  public mlsNum: string;

  @NullableForeignKeyAttribute({ alias: "PersonId" })
  public personId?: NullableForeignKey;

  @BelongsTo(() => Person, { foreignKey: "personId" })
  public person?: Person;

  @HasOne(() => Address, { foreignKey: "homeId" })
  public address: Address;
}

@Entity
class Address extends MockTable {
  @Attribute({ alias: "State" })
  public state: string;

  @ForeignKeyAttribute({ alias: "HomeId" })
  public homeId: ForeignKey;

  @BelongsTo(() => Home, { foreignKey: "homeId" })
  public home: Home;

  @ForeignKeyAttribute({ alias: "PhoneBookId" })
  public phoneBookId: ForeignKey;

  @BelongsTo(() => PhoneBook, { foreignKey: "phoneBookId" })
  public phoneBook: PhoneBook;
}

@Entity
class PhoneBook extends MockTable {
  @Attribute({ alias: "Edition" })
  public edition: string;

  @HasMany(() => Address, { foreignKey: "phoneBookId" })
  public address: Address[];
}

export {
  MockTable,
  Order,
  PaymentMethodProvider,
  PaymentMethod,
  Customer,
  ContactInformation,
  Person,
  Pet,
  Home,
  Address,
  PhoneBook
};
