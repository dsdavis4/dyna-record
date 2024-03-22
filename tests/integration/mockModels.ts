import DynaRecord from "../../src";
import {
  Table,
  Entity,
  PartitionKeyAttribute,
  SortKeyAttribute,
  Attribute,
  ForeignKeyAttribute,
  HasMany,
  BelongsTo,
  HasOne,
  NullableForeignKeyAttribute,
  NullableAttribute,
  DateAttribute,
  HasAndBelongsToMany,
  DateNullableAttribute
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
  delimiter: "#",
  defaultFields: {
    id: { alias: "Id" },
    type: { alias: "Type" },
    createdAt: { alias: "CreatedAt" },
    updatedAt: { alias: "UpdatedAt" },
    foreignKey: { alias: "ForeignKey" },
    foreignEntityType: { alias: "ForeignEntityType" }
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
  @ForeignKeyAttribute({ alias: "CustomerId" })
  public readonly customerId: ForeignKey;

  @ForeignKeyAttribute({ alias: "PaymentMethodId" })
  public readonly paymentMethodId: ForeignKey;

  @DateAttribute({ alias: "OrderDate" })
  public readonly orderDate: Date;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public readonly customer: Customer;

  @BelongsTo(() => PaymentMethod, { foreignKey: "paymentMethodId" })
  public readonly paymentMethod: PaymentMethod;
}

@Entity
class PaymentMethodProvider extends MockTable {
  @Attribute({ alias: "Name" })
  public readonly name: string;

  @ForeignKeyAttribute({ alias: "PaymentMethodId" })
  public readonly paymentMethodId: ForeignKey;

  @BelongsTo(() => PaymentMethod, { foreignKey: "paymentMethodId" })
  public readonly paymentMethod: PaymentMethod;
}

@Entity
class PaymentMethod extends MockTable {
  @Attribute({ alias: "LastFour" })
  public readonly lastFour: string;

  @ForeignKeyAttribute({ alias: "CustomerId" })
  public readonly customerId: ForeignKey;

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
  @Attribute({ alias: "Name" })
  public readonly name: string;

  @Attribute({ alias: "Address" })
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
  @Attribute({ alias: "Email" })
  public readonly email: string;

  @NullableAttribute({ alias: "Phone" })
  public readonly phone?: string;

  @NullableForeignKeyAttribute({ alias: "CustomerId" })
  public readonly customerId?: NullableForeignKey;

  @BelongsTo(() => Customer, { foreignKey: "customerId" })
  public readonly customer?: Customer;
}

@Entity
class Person extends MockTable {
  @Attribute({ alias: "Name" })
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
  @Attribute({ alias: "Name" })
  public readonly name: string;

  @NullableForeignKeyAttribute({ alias: "OwnerId" })
  public readonly ownerId?: NullableForeignKey;

  @BelongsTo(() => Person, { foreignKey: "ownerId" })
  public readonly owner?: Person;

  @DateNullableAttribute({ alias: "AdoptedDate" })
  public readonly adoptedDate?: Date;
}

@Entity
class Home extends MockTable {
  @Attribute({ alias: "MLS#" })
  public readonly mlsNum: string;

  @NullableForeignKeyAttribute({ alias: "PersonId" })
  public readonly personId?: NullableForeignKey;

  @BelongsTo(() => Person, { foreignKey: "personId" })
  public readonly person: Person;

  @HasOne(() => Address, { foreignKey: "homeId" })
  public readonly address: Address;
}

@Entity
class Address extends MockTable {
  @Attribute({ alias: "State" })
  public readonly state: string;

  @ForeignKeyAttribute({ alias: "HomeId" })
  public readonly homeId: ForeignKey;

  @BelongsTo(() => Home, { foreignKey: "homeId" })
  public readonly home: Home;

  @ForeignKeyAttribute({ alias: "PhoneBookId" })
  public readonly phoneBookId: ForeignKey;

  @BelongsTo(() => PhoneBook, { foreignKey: "phoneBookId" })
  public readonly phoneBook: PhoneBook;
}

@Entity
class PhoneBook extends MockTable {
  @Attribute({ alias: "Edition" })
  public readonly edition: string;

  @HasMany(() => Address, { foreignKey: "phoneBookId" })
  public readonly addresses: Address[];
}

@Entity
class Book extends MockTable {
  @Attribute({ alias: "Name" })
  public readonly name: string;

  @Attribute({ alias: "NumPages" })
  public readonly numPages: number;

  @NullableForeignKeyAttribute({ alias: "PersonId" })
  public readonly ownerId?: NullableForeignKey;

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
  @Attribute({ alias: "Name" })
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

@Table({ name: "other-table", delimiter: "|" })
abstract class OtherTable extends DynaRecord {
  @PartitionKeyAttribute()
  public readonly myPk: PartitionKey;

  @SortKeyAttribute()
  public readonly mySk: SortKey;
}

@Entity
class Teacher extends OtherTable {
  @Attribute()
  public readonly name: string;

  @HasMany(() => Course, { foreignKey: "teacherId" })
  public readonly courses: Course[];

  @HasOne(() => Profile, { foreignKey: "userId" })
  public readonly profile: Profile;
}

@Entity
class Student extends OtherTable {
  @Attribute()
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
  @Attribute()
  public readonly name: string;

  @NullableForeignKeyAttribute()
  public readonly teacherId?: NullableForeignKey;

  @BelongsTo(() => Teacher, { foreignKey: "teacherId" })
  public readonly teacher: Teacher;

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
  @Attribute()
  public readonly title: string;

  @ForeignKeyAttribute()
  public readonly courseId: ForeignKey;

  @BelongsTo(() => Course, { foreignKey: "courseId" })
  public readonly course: Course;

  @HasOne(() => Grade, { foreignKey: "assignmentId" })
  public readonly grade: Grade;
}

@Entity
class Grade extends OtherTable {
  @Attribute({ alias: "LetterValue" })
  public readonly gradeValue: string;

  @ForeignKeyAttribute()
  public readonly assignmentId: ForeignKey;

  @BelongsTo(() => Assignment, { foreignKey: "assignmentId" })
  public readonly assignment: Assignment;

  @ForeignKeyAttribute()
  public readonly studentId: ForeignKey;

  @BelongsTo(() => Student, { foreignKey: "studentId" })
  public readonly student: Student;
}

@Entity
class Profile extends OtherTable {
  @DateAttribute()
  public readonly lastLogin: Date;

  @ForeignKeyAttribute()
  public readonly userId: ForeignKey;

  @NullableAttribute()
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
