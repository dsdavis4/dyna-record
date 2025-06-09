import Logger from "../src/Logger";
import { type DynamoTableItem } from "../src/types";
import { Course, Customer } from "./integration/mockModels";

describe("DynaRecord", () => {
  describe("tableItemToEntity", () => {
    it("it will convert a table item to its associated entity", () => {
      expect.assertions(2);

      const tableItem: DynamoTableItem = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Name: "Some Customer",
        Address: "11 Some St",
        Type: "Customer",
        CreatedAt: "2023-08-02T04:26:31.148Z",
        UpdatedAt: "2023-09-15T04:26:31.148Z"
      };

      const customer = Customer.tableItemToEntity(tableItem);

      expect(customer).toBeInstanceOf(Customer);
      expect(customer).toEqual({
        pk: "Customer#123",
        sk: "Customer",
        id: "123",
        type: "Customer",
        name: "Some Customer",
        address: "11 Some St",
        createdAt: new Date("2023-08-02T04:26:31.148Z"),
        updatedAt: new Date("2023-09-15T04:26:31.148Z")
      });
    });

    it("when the table uses aliases - it will convert a table item to its associated entity", () => {
      expect.assertions(2);

      const tableItem: DynamoTableItem = {
        myPk: "Course|123",
        mySk: "Course",
        id: "123",
        type: "Course",
        name: "Math",
        teacherId: "456",
        createdAt: "2023-01-15T12:12:18.123Z",
        updatedAt: "2023-02-15T08:31:15.148Z"
      };

      const course = Course.tableItemToEntity(tableItem);

      expect(course).toBeInstanceOf(Course);
      expect(course).toEqual({
        myPk: "Course|123",
        mySk: "Course",
        id: "123",
        type: "Course",
        name: "Math",
        teacherId: "456",
        createdAt: new Date("2023-01-15T12:12:18.123Z"),
        updatedAt: new Date("2023-02-15T08:31:15.148Z")
      });
    });

    it("will throw an error if it cannot convert a table item to entity because the type is not for the model this was called for", () => {
      expect.assertions(1);

      const tableItem: DynamoTableItem = {
        pk: "Customer#123",
        sk: "Order#001",
        id: "001",
        type: "Order",
        customerId: "123",
        orderDate: "2022-10-14T09:31:15.148Z",
        paymentMethodId: "008",
        createdAt: "2022-10-15T09:31:15.148Z",
        updatedAt: "2022-10-16T09:31:15.148Z"
      };

      try {
        Customer.tableItemToEntity(tableItem);
      } catch (error) {
        expect(error).toEqual(
          new Error("Unable to convert dynamo item to entity. Invalid type")
        );
      }
    });

    describe("types", () => {
      const tableItem: DynamoTableItem = {
        PK: "Customer#123",
        SK: "Customer",
        Id: "123",
        Name: "Some Customer",
        Address: "11 Some St",
        Type: "Customer",
        CreatedAt: "2023-08-02T04:26:31.148Z",
        UpdatedAt: "2023-09-15T04:26:31.148Z"
      };

      const customer = Customer.tableItemToEntity(tableItem);

      it("entity attributes are allowed", () => {
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(customer.pk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(customer.sk);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(customer.type);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(customer.id);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(customer.name);
        // @ts-expect-no-error: Entity Attributes are allowed
        Logger.log(customer.address);
      });

      it("relationship attributes are not allowed", () => {
        // @ts-expect-error: Relationship attributes are not allowed
        Logger.log(customer.orders);
        // @ts-expect-error: Relationship attributes are not allowed
        Logger.log(customer.paymentMethods);
        // @ts-expect-error: Relationship attributes are not allowed
        Logger.log(customer.contactInformation);
      });

      it("instance methods are allowed", () => {
        // @ts-expect-no-error: Instance methods are allowed
        Logger.log(customer.mockCustomInstanceMethod);
        // @ts-expect-no-error: Instance methods are allowed
        Logger.log(customer.update);
        // @ts-expect-no-error: Instance methods are allowed
        Logger.log(customer.partitionKeyValue);
      });
    });
  });
});
