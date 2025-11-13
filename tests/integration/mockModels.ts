import DynaRecord from "../../index";
import {
  Table,
  Entity,
  PartitionKeyAttribute,
  SortKeyAttribute,
  ForeignKeyAttribute,
  HasMany,
  BelongsTo,
  HasOne,
  DateAttribute,
  StringAttribute,
  HasAndBelongsToMany,
  BooleanAttribute,
  NumberAttribute,
  EnumAttribute,
  IdAttribute
} from "../../src/decorators";
import { JoinTable } from "../../src/relationships";
import type {
  PartitionKey,
  SortKey,
  ForeignKey,
  NullableForeignKey
} from "../../src/types";

@Table({
  name: "mock-table",
  defaultFields: {
    id: { alias: "Id" },
    type: { alias: "Type" },
    createdAt: { alias: "CreatedAt" },
    updatedAt: { alias: "UpdatedAt" }
  }
})
abstract class MockTable extends DynaRecord {
  @PartitionKeyAttribute({ alias: "PK" })
  public readonly pk: PartitionKey;

  @SortKeyAttribute({ alias: "SK" })
  public readonly sk: SortKey;
}

@Entity
class Order extends MockTable {
  @ForeignKeyAttribute(() => Customer, { alias: "CustomerId" })
  public readonly customerId: ForeignKey<Customer>;

  @ForeignKeyAttribute(() => PaymentMethod, { alias: "PaymentMethodId" })
  public readonly paymentMethodId: ForeignKey<PaymentMethod>;

  @DateAttribute({ alias: "OrderDate" })
  public readonly orderDate: Date;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public readonly customer: Customer;

  @BelongsTo(() => PaymentMethod, { foreignKey: "paymentMethodId" })
  public readonly paymentMethod: PaymentMethod;
}

@Entity
class PaymentMethodProvider extends MockTable {
  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @ForeignKeyAttribute(() => PaymentMethod, { alias: "PaymentMethodId" })
  public readonly paymentMethodId: ForeignKey<PaymentMethod>;

  @BelongsTo(() => PaymentMethod, { foreignKey: "paymentMethodId" })
  public readonly paymentMethod: PaymentMethod;
}

@Entity
class PaymentMethod extends MockTable {
  @StringAttribute({ alias: "LastFour" })
  public readonly lastFour: string;

  @ForeignKeyAttribute(() => Customer, { alias: "CustomerId" })
  public readonly customerId: ForeignKey<Customer>;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public readonly customer: Customer;

  @HasMany(() => Order, { foreignKey: "paymentMethodId" })
  public readonly orders: Order[];

  @HasOne(() => PaymentMethodProvider, {
    foreignKey: "paymentMethodId"
  })
  public readonly paymentMethodProvider: PaymentMethodProvider;
}

@Entity
class Customer extends MockTable {
  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @StringAttribute({ alias: "Address" })
  public readonly address: string;

  @HasMany(() => Order, { foreignKey: "customerId" })
  public readonly orders: Order[];

  @HasMany(() => PaymentMethod, { foreignKey: "customerId" })
  public readonly paymentMethods: PaymentMethod[];

  @HasOne(() => ContactInformation, { foreignKey: "customerId" })
  public readonly contactInformation?: ContactInformation;

  public mockCustomInstanceMethod(): string {
    return `${this.name}-${this.id}`;
  }
}

@Entity
class ContactInformation extends MockTable {
  @StringAttribute({ alias: "Email" })
  public readonly email: string;

  @StringAttribute({ alias: "Phone", nullable: true })
  public readonly phone?: string;

  @ForeignKeyAttribute(() => Customer, { alias: "CustomerId", nullable: true })
  public readonly customerId?: NullableForeignKey<Customer>;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public readonly customer?: Customer;
}

@Entity
class Person extends MockTable {
  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @HasMany(() => Pet, { foreignKey: "ownerId" })
  public readonly pets: Pet[];

  @HasOne(() => Home, { foreignKey: "personId" })
  public readonly home: Home;

  @HasMany(() => Book, { foreignKey: "ownerId" })
  public readonly books: Book[];
}

@Entity
class Pet extends MockTable {
  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @ForeignKeyAttribute(() => Person, { alias: "OwnerId", nullable: true })
  public readonly ownerId?: NullableForeignKey<Person>;

  @BelongsTo(() => Person, { foreignKey: "ownerId" })
  public readonly owner?: Person;

  @DateAttribute({ alias: "AdoptedDate", nullable: true })
  public readonly adoptedDate?: Date;
}

@Entity
class Home extends MockTable {
  @StringAttribute({ alias: "MLS#" })
  public readonly mlsNum: string;

  @StringAttribute({ alias: "Neighborhood", nullable: true })
  public readonly neighborhood?: string;

  @ForeignKeyAttribute(() => Person, { alias: "PersonId", nullable: true })
  public readonly personId?: NullableForeignKey<Person>;

  @BelongsTo(() => Person, { foreignKey: "personId" })
  public readonly person: Person;

  @HasOne(() => Address, { foreignKey: "homeId" })
  public readonly address: Address;
}

@Entity
class Address extends MockTable {
  @StringAttribute({ alias: "State" })
  public readonly state: string;

  @ForeignKeyAttribute(() => Home, { alias: "HomeId" })
  public readonly homeId: ForeignKey<Home>;

  @BelongsTo(() => Home, { foreignKey: "homeId" })
  public readonly home: Home;

  @ForeignKeyAttribute(() => PhoneBook, { alias: "PhoneBookId" })
  public readonly phoneBookId: ForeignKey<PhoneBook>;

  @BelongsTo(() => PhoneBook, { foreignKey: "phoneBookId" })
  public readonly phoneBook: PhoneBook;
}

@Entity
class PhoneBook extends MockTable {
  @StringAttribute({ alias: "Edition" })
  public readonly edition: string;

  @HasMany(() => Address, { foreignKey: "phoneBookId" })
  public readonly addresses: Address[];
}

@Entity
class Book extends MockTable {
  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @NumberAttribute({ alias: "NumPages" })
  public readonly numPages: number;

  @ForeignKeyAttribute(() => Person, { alias: "PersonId", nullable: true })
  public readonly ownerId?: NullableForeignKey<Person>;

  @HasAndBelongsToMany(() => Author, {
    targetKey: "books",
    through: () => ({ joinTable: AuthorBook, foreignKey: "bookId" })
  })
  public readonly authors: Author[];

  @BelongsTo(() => Person, { foreignKey: "ownerId" })
  public readonly owner: Person;
}

@Entity
class Author extends MockTable {
  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @HasAndBelongsToMany(() => Book, {
    targetKey: "authors",
    through: () => ({ joinTable: AuthorBook, foreignKey: "authorId" })
  })
  public readonly books: Book[];
}

class AuthorBook extends JoinTable<Author, Book> {
  public readonly bookId: ForeignKey;
  public readonly authorId: ForeignKey;
}

@Entity
class MyClassWithAllAttributeTypes extends MockTable {
  @StringAttribute()
  public stringAttribute: string;

  @StringAttribute({ nullable: true })
  public nullableStringAttribute?: string;

  @DateAttribute()
  public dateAttribute: Date;

  @DateAttribute({ nullable: true })
  public nullableDateAttribute?: Date;

  @BooleanAttribute()
  public boolAttribute: boolean;

  @BooleanAttribute({ nullable: true })
  public nullableBoolAttribute?: boolean;

  @NumberAttribute()
  public numberAttribute: number;

  @NumberAttribute({ nullable: true })
  public nullableNumberAttribute?: number;

  @ForeignKeyAttribute(() => Customer)
  public foreignKeyAttribute: ForeignKey<Customer>;

  @ForeignKeyAttribute(() => Customer, { nullable: true })
  public nullableForeignKeyAttribute?: NullableForeignKey<Customer>;

  @EnumAttribute({ values: ["val-1", "val-2"] })
  public enumAttribute: "val-1" | "val-2";

  @EnumAttribute({ values: ["val-1", "val-2"], nullable: true })
  public nullableEnumAttribute?: "val-1" | "val-2";
}

@Entity
class User extends MockTable {
  @IdAttribute
  @StringAttribute({ alias: "Email" })
  public readonly email: string;

  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @BelongsTo(() => Organization, { foreignKey: "orgId" })
  public readonly org: Organization;

  @ForeignKeyAttribute(() => Organization, {
    alias: "OrgId",
    nullable: true
  })
  public readonly orgId?: NullableForeignKey<Organization>;

  @BelongsTo(() => Desk, { foreignKey: "deskId" })
  public readonly desk: Desk;

  @ForeignKeyAttribute(() => Desk, { alias: "DeskId", nullable: true })
  public readonly deskId?: NullableForeignKey<Desk>;

  @HasAndBelongsToMany(() => Website, {
    targetKey: "users",
    through: () => ({ joinTable: UserWebsite, foreignKey: "userId" })
  })
  public readonly websites: Website[];
}

@Entity
class Organization extends MockTable {
  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @HasMany(() => User, { foreignKey: "orgId" })
  public readonly users: User[];

  @HasMany(() => Employee, {
    foreignKey: "organizationId",
    uniDirectional: true
  })
  public readonly employees: Employee[];

  @HasMany(() => Founder, {
    foreignKey: "organizationId",
    uniDirectional: true
  })
  public readonly founders: Founder[];
}

@Entity
class Founder extends MockTable {
  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @ForeignKeyAttribute(() => Organization, { alias: "OrganizationId" })
  public readonly organizationId: ForeignKey<Organization>;
}

@Entity
class Desk extends MockTable {
  @NumberAttribute({ alias: "Num" })
  public readonly num: number;

  @HasOne(() => User, { foreignKey: "deskId" })
  public readonly user?: User;
}

@Entity
class Website extends MockTable {
  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @HasAndBelongsToMany(() => User, {
    targetKey: "websites",
    through: () => ({ joinTable: UserWebsite, foreignKey: "websiteId" })
  })
  public readonly users: User[];
}

class UserWebsite extends JoinTable<User, Website> {
  public readonly userId: ForeignKey;
  public readonly websiteId: ForeignKey;
}

@Entity
class Employee extends MockTable {
  @StringAttribute({ alias: "Name" })
  public readonly name: string;

  @ForeignKeyAttribute(() => Organization, {
    alias: "OrganizationId",
    nullable: true
  })
  public readonly organizationId: NullableForeignKey<Organization>;
}

@Table({ name: "other-table", delimiter: "|" })
abstract class OtherTable extends DynaRecord {
  @PartitionKeyAttribute()
  public readonly myPk: PartitionKey;

  @SortKeyAttribute()
  public readonly mySk: SortKey;
}

@Entity
class Teacher extends OtherTable {
  @StringAttribute()
  public readonly name: string;

  @HasMany(() => Course, { foreignKey: "teacherId" })
  public readonly courses: Course[];

  @HasOne(() => Profile, { foreignKey: "userId" })
  public readonly profile: Profile;
}

@Entity
class Student extends OtherTable {
  @StringAttribute()
  public readonly name: string;

  @HasAndBelongsToMany(() => Course, {
    targetKey: "students",
    through: () => ({ joinTable: StudentCourse, foreignKey: "studentId" })
  })
  public readonly courses: Course[];

  @HasOne(() => Profile, { foreignKey: "userId" })
  public readonly profile: Profile;

  @HasMany(() => Grade, { foreignKey: "studentId" })
  public readonly grades: Grade[];
}

@Entity
class Course extends OtherTable {
  @StringAttribute()
  public readonly name: string;

  @ForeignKeyAttribute(() => Teacher, { nullable: true })
  public readonly teacherId?: NullableForeignKey<Teacher>;

  @BelongsTo(() => Teacher, { foreignKey: "teacherId" })
  public readonly teacher?: Teacher;

  @HasMany(() => Assignment, { foreignKey: "courseId" })
  public readonly assignments: Assignment[];

  @HasAndBelongsToMany(() => Student, {
    targetKey: "courses",
    through: () => ({ joinTable: StudentCourse, foreignKey: "courseId" })
  })
  public readonly students: Student[];
}

@Entity
class Assignment extends OtherTable {
  @StringAttribute()
  public readonly title: string;

  @ForeignKeyAttribute(() => Course)
  public readonly courseId: ForeignKey<Course>;

  @BelongsTo(() => Course, { foreignKey: "courseId" })
  public readonly course: Course;

  @HasOne(() => Grade, { foreignKey: "assignmentId" })
  public readonly grade: Grade;
}

@Entity
class Grade extends OtherTable {
  @StringAttribute({ alias: "LetterValue" })
  public readonly gradeValue: string;

  @ForeignKeyAttribute(() => Assignment)
  public readonly assignmentId: ForeignKey<Assignment>;

  @BelongsTo(() => Assignment, { foreignKey: "assignmentId" })
  public readonly assignment: Assignment;

  @ForeignKeyAttribute(() => Student)
  public readonly studentId: ForeignKey<Student>;

  @BelongsTo(() => Student, { foreignKey: "studentId" })
  public readonly student: Student;
}

@Entity
class Profile extends OtherTable {
  @DateAttribute()
  public readonly lastLogin: Date;

  @ForeignKeyAttribute(() => Student)
  public readonly userId: ForeignKey<Student>;

  @StringAttribute({ nullable: true })
  public readonly alternateEmail?: string;
}

class StudentCourse extends JoinTable<Student, Course> {
  public readonly studentId: ForeignKey;
  public readonly courseId: ForeignKey;
}

export {
  // MockTable exports
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
  PhoneBook,
  Author,
  Book,
  AuthorBook,
  MyClassWithAllAttributeTypes,
  User,
  Organization,
  Website,
  UserWebsite,
  Desk,
  Employee,
  Founder,
  // OtherTable exports
  OtherTable,
  Teacher,
  Student,
  Course,
  Assignment,
  Profile,
  StudentCourse,
  Grade
};
