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
  NullableAttribute,
  DateAttribute,
  HasAndBelongsToMany
} from "../../src/decorators";
import { JoinTable } from "../../src/relationships";
import type {
  PrimaryKey,
  SortKey,
  ForeignKey,
  NullableForeignKey
} from "../../src/types";

@Table({
  name: "mock-table",
  delimiter: "#",
  // TODO add type test that the keys of this have to be what is below and value can be any string
  defaultFields: {
    id: "Id",
    type: "Type",
    createdAt: "CreatedAt",
    updatedAt: "UpdatedAt",
    foreignKey: "ForeignKey",
    foreignEntityType: "ForeignEntityType"
  }
})
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

  @DateAttribute({ alias: "OrderDate" })
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
  public customerId?: NullableForeignKey;

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

  @HasMany(() => Book, { foreignKey: "ownerId" })
  public books: Book[];
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

@Entity
class Book extends MockTable {
  @Attribute({ alias: "Name" })
  public name: string;

  @Attribute({ alias: "NumPages" })
  public numPages: number;

  @NullableForeignKeyAttribute({ alias: "PersonId" })
  public ownerId?: NullableForeignKey;

  @HasAndBelongsToMany(() => Author, {
    targetKey: "books",
    through: () => ({ joinTable: AuthorBook, foreignKey: "bookId" })
  })
  public authors: Author[];

  @BelongsTo(() => Person, { foreignKey: "ownerId" })
  public owner: Person;
}

@Entity
class Author extends MockTable {
  @Attribute({ alias: "Name" })
  public name: string;

  @HasAndBelongsToMany(() => Book, {
    targetKey: "authors",
    through: () => ({ joinTable: AuthorBook, foreignKey: "authorId" })
  })
  public books: Book[];
}

class AuthorBook extends JoinTable<Author, Book> {
  public bookId: ForeignKey;
  public authorId: ForeignKey;
}

@Table({ name: "other-table", delimiter: "|" })
abstract class OtherTable extends SingleTableDesign {
  @PrimaryKeyAttribute()
  public myPk: PrimaryKey;

  @SortKeyAttribute()
  public mySk: SortKey;
}

@Entity
class Teacher extends OtherTable {
  @Attribute()
  public name: string;

  @HasMany(() => Course, { foreignKey: "teacherId" })
  public courses: Course[];

  @HasOne(() => Profile, { foreignKey: "userId" })
  public profile: Profile;
}

@Entity
class Student extends OtherTable {
  @Attribute()
  public name: string;

  @HasAndBelongsToMany(() => Course, {
    targetKey: "students",
    through: () => ({ joinTable: StudentCourse, foreignKey: "studentId" })
  })
  public courses: Course[];

  @HasOne(() => Profile, { foreignKey: "userId" })
  public profile: Profile;

  @HasMany(() => Grade, { foreignKey: "studentId" })
  public grades: Grade[];
}

@Entity
class Course extends OtherTable {
  @Attribute()
  public name: string;

  @NullableForeignKeyAttribute()
  public teacherId?: NullableForeignKey;

  @BelongsTo(() => Teacher, { foreignKey: "teacherId" })
  public teacher?: Teacher;

  @HasMany(() => Assignment, { foreignKey: "courseId" })
  public assignments: Assignment[];

  @HasAndBelongsToMany(() => Student, {
    targetKey: "courses",
    through: () => ({ joinTable: StudentCourse, foreignKey: "courseId" })
  })
  public students: Student[];
}

@Entity
class Assignment extends OtherTable {
  @Attribute()
  public title: string;

  @ForeignKeyAttribute()
  public courseId: ForeignKey;

  @BelongsTo(() => Course, { foreignKey: "courseId" })
  public course: Course;

  @HasOne(() => Grade, { foreignKey: "assignmentId" })
  public grade: Grade;
}

@Entity
class Grade extends OtherTable {
  @Attribute({ alias: "LetterValue" })
  public gradeValue: string;

  @ForeignKeyAttribute()
  public assignmentId: ForeignKey;

  @BelongsTo(() => Assignment, { foreignKey: "assignmentId" })
  public assignment: Assignment;

  @ForeignKeyAttribute()
  public studentId: ForeignKey;

  @BelongsTo(() => Student, { foreignKey: "studentId" })
  public student: Student;
}

@Entity
class Profile extends OtherTable {
  @DateAttribute()
  public lastLogin: Date;

  @ForeignKeyAttribute()
  public userId: ForeignKey;

  @NullableAttribute()
  public alternateEmail?: string;
}

class StudentCourse extends JoinTable<Student, Course> {
  public studentId: ForeignKey;
  public courseId: ForeignKey;
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
