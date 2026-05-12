import {
  MockTable,
  OtherTable,
  addressSchema,
  arrayOfObjectsSchema,
  arrayOfUnionsSchema,
  contactSchema,
  deeplyNestedSchema,
  dimensionsSchema,
  duplicateFieldNameSchema,
  inventorySchema,
  locationSchema,
  nullableUnionSchema,
  paymentSchema
} from "../integration/mockModels";

describe("TableMetadata", () => {
  describe("MockTable.metadata()", () => {
    it("returns the complete table metadata for MockTable", () => {
      expect.assertions(1);

      const metadata = MockTable.metadata();

      expect(metadata).toStrictEqual({
        name: "mock-table",
        delimiter: "#",
        defaultAttributes: {
          id: {
            name: "id",
            alias: "Id",
            kind: "string",
            nullable: false
          },
          type: {
            name: "type",
            alias: "Type",
            kind: "string",
            nullable: false
          },
          createdAt: {
            name: "createdAt",
            alias: "CreatedAt",
            kind: "date",
            nullable: false
          },
          updatedAt: {
            name: "updatedAt",
            alias: "UpdatedAt",
            kind: "date",
            nullable: false
          }
        },
        defaultTableAttributes: {
          Id: {
            name: "id",
            alias: "Id",
            kind: "string",
            nullable: false
          },
          Type: {
            name: "type",
            alias: "Type",
            kind: "string",
            nullable: false
          },
          CreatedAt: {
            name: "createdAt",
            alias: "CreatedAt",
            kind: "date",
            nullable: false
          },
          UpdatedAt: {
            name: "updatedAt",
            alias: "UpdatedAt",
            kind: "date",
            nullable: false
          }
        },
        partitionKeyAttribute: {
          name: "pk",
          alias: "PK",
          kind: "string",
          nullable: false
        },
        sortKeyAttribute: {
          name: "sk",
          alias: "SK",
          kind: "string",
          nullable: false
        },
        entities: {
          Order: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              customerId: {
                name: "customerId",
                alias: "CustomerId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Customer"
              },
              paymentMethodId: {
                name: "paymentMethodId",
                alias: "PaymentMethodId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "PaymentMethod"
              },
              orderDate: {
                name: "orderDate",
                alias: "OrderDate",
                kind: "date",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              CustomerId: {
                name: "customerId",
                alias: "CustomerId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Customer"
              },
              PaymentMethodId: {
                name: "paymentMethodId",
                alias: "PaymentMethodId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "PaymentMethod"
              },
              OrderDate: {
                name: "orderDate",
                alias: "OrderDate",
                kind: "date",
                nullable: false
              }
            },
            relationships: {
              customer: {
                type: "BelongsTo",
                propertyName: "customer",
                target: "Customer",
                foreignKey: "customerId"
              },
              paymentMethod: {
                type: "BelongsTo",
                propertyName: "paymentMethod",
                target: "PaymentMethod",
                foreignKey: "paymentMethodId"
              }
            }
          },
          PaymentMethodProvider: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              paymentMethodId: {
                name: "paymentMethodId",
                alias: "PaymentMethodId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "PaymentMethod"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              PaymentMethodId: {
                name: "paymentMethodId",
                alias: "PaymentMethodId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "PaymentMethod"
              }
            },
            relationships: {
              paymentMethod: {
                type: "BelongsTo",
                propertyName: "paymentMethod",
                target: "PaymentMethod",
                foreignKey: "paymentMethodId"
              }
            }
          },
          PaymentMethod: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              lastFour: {
                name: "lastFour",
                alias: "LastFour",
                kind: "string",
                nullable: false
              },
              customerId: {
                name: "customerId",
                alias: "CustomerId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Customer"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              LastFour: {
                name: "lastFour",
                alias: "LastFour",
                kind: "string",
                nullable: false
              },
              CustomerId: {
                name: "customerId",
                alias: "CustomerId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Customer"
              }
            },
            relationships: {
              customer: {
                type: "BelongsTo",
                propertyName: "customer",
                target: "Customer",
                foreignKey: "customerId"
              },
              orders: {
                type: "HasMany",
                propertyName: "orders",
                target: "Order",
                foreignKey: "paymentMethodId"
              },
              paymentMethodProvider: {
                type: "HasOne",
                propertyName: "paymentMethodProvider",
                target: "PaymentMethodProvider",
                foreignKey: "paymentMethodId"
              }
            }
          },
          Customer: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              address: {
                name: "address",
                alias: "Address",
                kind: "string",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              Address: {
                name: "address",
                alias: "Address",
                kind: "string",
                nullable: false
              }
            },
            relationships: {
              orders: {
                type: "HasMany",
                propertyName: "orders",
                target: "Order",
                foreignKey: "customerId"
              },
              paymentMethods: {
                type: "HasMany",
                propertyName: "paymentMethods",
                target: "PaymentMethod",
                foreignKey: "customerId"
              },
              contactInformation: {
                type: "HasOne",
                propertyName: "contactInformation",
                target: "ContactInformation",
                foreignKey: "customerId"
              }
            }
          },
          ContactInformation: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              email: {
                name: "email",
                alias: "Email",
                kind: "string",
                nullable: false
              },
              phone: {
                name: "phone",
                alias: "Phone",
                kind: "string",
                nullable: true
              },
              customerId: {
                name: "customerId",
                alias: "CustomerId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Customer"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Email: {
                name: "email",
                alias: "Email",
                kind: "string",
                nullable: false
              },
              Phone: {
                name: "phone",
                alias: "Phone",
                kind: "string",
                nullable: true
              },
              CustomerId: {
                name: "customerId",
                alias: "CustomerId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Customer"
              }
            },
            relationships: {
              customer: {
                type: "BelongsTo",
                propertyName: "customer",
                target: "Customer",
                foreignKey: "customerId"
              }
            }
          },
          Person: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              }
            },
            relationships: {
              pets: {
                type: "HasMany",
                propertyName: "pets",
                target: "Pet",
                foreignKey: "ownerId"
              },
              home: {
                type: "HasOne",
                propertyName: "home",
                target: "Home",
                foreignKey: "personId"
              },
              books: {
                type: "HasMany",
                propertyName: "books",
                target: "Book",
                foreignKey: "ownerId"
              }
            }
          },
          Pet: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              ownerId: {
                name: "ownerId",
                alias: "OwnerId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Person"
              },
              adoptedDate: {
                name: "adoptedDate",
                alias: "AdoptedDate",
                kind: "date",
                nullable: true
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              OwnerId: {
                name: "ownerId",
                alias: "OwnerId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Person"
              },
              AdoptedDate: {
                name: "adoptedDate",
                alias: "AdoptedDate",
                kind: "date",
                nullable: true
              }
            },
            relationships: {
              owner: {
                type: "BelongsTo",
                propertyName: "owner",
                target: "Person",
                foreignKey: "ownerId"
              }
            }
          },
          Home: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              mlsNum: {
                name: "mlsNum",
                alias: "MLS#",
                kind: "string",
                nullable: false
              },
              neighborhood: {
                name: "neighborhood",
                alias: "Neighborhood",
                kind: "string",
                nullable: true
              },
              personId: {
                name: "personId",
                alias: "PersonId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Person"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              "MLS#": {
                name: "mlsNum",
                alias: "MLS#",
                kind: "string",
                nullable: false
              },
              Neighborhood: {
                name: "neighborhood",
                alias: "Neighborhood",
                kind: "string",
                nullable: true
              },
              PersonId: {
                name: "personId",
                alias: "PersonId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Person"
              }
            },
            relationships: {
              person: {
                type: "BelongsTo",
                propertyName: "person",
                target: "Person",
                foreignKey: "personId"
              },
              address: {
                type: "HasOne",
                propertyName: "address",
                target: "Address",
                foreignKey: "homeId"
              }
            }
          },
          Address: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              state: {
                name: "state",
                alias: "State",
                kind: "string",
                nullable: false
              },
              homeId: {
                name: "homeId",
                alias: "HomeId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Home"
              },
              phoneBookId: {
                name: "phoneBookId",
                alias: "PhoneBookId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "PhoneBook"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              State: {
                name: "state",
                alias: "State",
                kind: "string",
                nullable: false
              },
              HomeId: {
                name: "homeId",
                alias: "HomeId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Home"
              },
              PhoneBookId: {
                name: "phoneBookId",
                alias: "PhoneBookId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "PhoneBook"
              }
            },
            relationships: {
              home: {
                type: "BelongsTo",
                propertyName: "home",
                target: "Home",
                foreignKey: "homeId"
              },
              phoneBook: {
                type: "BelongsTo",
                propertyName: "phoneBook",
                target: "PhoneBook",
                foreignKey: "phoneBookId"
              }
            }
          },
          PhoneBook: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              edition: {
                name: "edition",
                alias: "Edition",
                kind: "string",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Edition: {
                name: "edition",
                alias: "Edition",
                kind: "string",
                nullable: false
              }
            },
            relationships: {
              addresses: {
                type: "HasMany",
                propertyName: "addresses",
                target: "Address",
                foreignKey: "phoneBookId"
              }
            }
          },
          Book: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              numPages: {
                name: "numPages",
                alias: "NumPages",
                kind: "number",
                nullable: false
              },
              ownerId: {
                name: "ownerId",
                alias: "PersonId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Person"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              NumPages: {
                name: "numPages",
                alias: "NumPages",
                kind: "number",
                nullable: false
              },
              PersonId: {
                name: "ownerId",
                alias: "PersonId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Person"
              }
            },
            relationships: {
              authors: {
                type: "HasAndBelongsToMany",
                propertyName: "authors",
                target: "Author",
                joinTableName: "AuthorBook"
              },
              owner: {
                type: "BelongsTo",
                propertyName: "owner",
                target: "Person",
                foreignKey: "ownerId"
              }
            }
          },
          Author: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              }
            },
            relationships: {
              books: {
                type: "HasAndBelongsToMany",
                propertyName: "books",
                target: "Book",
                joinTableName: "AuthorBook"
              }
            }
          },
          MyClassWithAllAttributeTypes: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              stringAttribute: {
                name: "stringAttribute",
                alias: "stringAttribute",
                kind: "string",
                nullable: false
              },
              nullableStringAttribute: {
                name: "nullableStringAttribute",
                alias: "nullableStringAttribute",
                kind: "string",
                nullable: true
              },
              dateAttribute: {
                name: "dateAttribute",
                alias: "dateAttribute",
                kind: "date",
                nullable: false
              },
              nullableDateAttribute: {
                name: "nullableDateAttribute",
                alias: "nullableDateAttribute",
                kind: "date",
                nullable: true
              },
              boolAttribute: {
                name: "boolAttribute",
                alias: "boolAttribute",
                kind: "boolean",
                nullable: false
              },
              nullableBoolAttribute: {
                name: "nullableBoolAttribute",
                alias: "nullableBoolAttribute",
                kind: "boolean",
                nullable: true
              },
              numberAttribute: {
                name: "numberAttribute",
                alias: "numberAttribute",
                kind: "number",
                nullable: false
              },
              nullableNumberAttribute: {
                name: "nullableNumberAttribute",
                alias: "nullableNumberAttribute",
                kind: "number",
                nullable: true
              },
              foreignKeyAttribute: {
                name: "foreignKeyAttribute",
                alias: "foreignKeyAttribute",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Customer"
              },
              nullableForeignKeyAttribute: {
                name: "nullableForeignKeyAttribute",
                alias: "nullableForeignKeyAttribute",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Customer"
              },
              enumAttribute: {
                name: "enumAttribute",
                alias: "enumAttribute",
                kind: "enum",
                nullable: false,
                values: ["val-1", "val-2"]
              },
              nullableEnumAttribute: {
                name: "nullableEnumAttribute",
                alias: "nullableEnumAttribute",
                kind: "enum",
                nullable: true,
                values: ["val-1", "val-2"]
              },
              objectAttribute: {
                name: "objectAttribute",
                alias: "objectAttribute",
                kind: "object",
                nullable: false,
                schema: contactSchema
              },
              addressAttribute: {
                name: "addressAttribute",
                alias: "addressAttribute",
                kind: "object",
                nullable: false,
                schema: addressSchema
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              stringAttribute: {
                name: "stringAttribute",
                alias: "stringAttribute",
                kind: "string",
                nullable: false
              },
              nullableStringAttribute: {
                name: "nullableStringAttribute",
                alias: "nullableStringAttribute",
                kind: "string",
                nullable: true
              },
              dateAttribute: {
                name: "dateAttribute",
                alias: "dateAttribute",
                kind: "date",
                nullable: false
              },
              nullableDateAttribute: {
                name: "nullableDateAttribute",
                alias: "nullableDateAttribute",
                kind: "date",
                nullable: true
              },
              boolAttribute: {
                name: "boolAttribute",
                alias: "boolAttribute",
                kind: "boolean",
                nullable: false
              },
              nullableBoolAttribute: {
                name: "nullableBoolAttribute",
                alias: "nullableBoolAttribute",
                kind: "boolean",
                nullable: true
              },
              numberAttribute: {
                name: "numberAttribute",
                alias: "numberAttribute",
                kind: "number",
                nullable: false
              },
              nullableNumberAttribute: {
                name: "nullableNumberAttribute",
                alias: "nullableNumberAttribute",
                kind: "number",
                nullable: true
              },
              foreignKeyAttribute: {
                name: "foreignKeyAttribute",
                alias: "foreignKeyAttribute",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Customer"
              },
              nullableForeignKeyAttribute: {
                name: "nullableForeignKeyAttribute",
                alias: "nullableForeignKeyAttribute",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Customer"
              },
              enumAttribute: {
                name: "enumAttribute",
                alias: "enumAttribute",
                kind: "enum",
                nullable: false,
                values: ["val-1", "val-2"]
              },
              nullableEnumAttribute: {
                name: "nullableEnumAttribute",
                alias: "nullableEnumAttribute",
                kind: "enum",
                nullable: true,
                values: ["val-1", "val-2"]
              },
              objectAttribute: {
                name: "objectAttribute",
                alias: "objectAttribute",
                kind: "object",
                nullable: false,
                schema: contactSchema
              },
              addressAttribute: {
                name: "addressAttribute",
                alias: "addressAttribute",
                kind: "object",
                nullable: false,
                schema: addressSchema
              }
            },
            relationships: {}
          },
          User: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              email: {
                name: "email",
                alias: "Email",
                kind: "string",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              orgId: {
                name: "orgId",
                alias: "OrgId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Organization"
              },
              deskId: {
                name: "deskId",
                alias: "DeskId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Desk"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Email: {
                name: "email",
                alias: "Email",
                kind: "string",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              OrgId: {
                name: "orgId",
                alias: "OrgId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Organization"
              },
              DeskId: {
                name: "deskId",
                alias: "DeskId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Desk"
              }
            },
            relationships: {
              org: {
                type: "BelongsTo",
                propertyName: "org",
                target: "Organization",
                foreignKey: "orgId"
              },
              desk: {
                type: "BelongsTo",
                propertyName: "desk",
                target: "Desk",
                foreignKey: "deskId"
              },
              websites: {
                type: "HasAndBelongsToMany",
                propertyName: "websites",
                target: "Website",
                joinTableName: "UserWebsite"
              }
            },
            idField: "email"
          },
          Organization: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              }
            },
            relationships: {
              users: {
                type: "HasMany",
                propertyName: "users",
                target: "User",
                foreignKey: "orgId"
              },
              employees: {
                type: "HasMany",
                propertyName: "employees",
                target: "Employee",
                foreignKey: "organizationId",
                uniDirectional: true
              },
              founders: {
                type: "HasMany",
                propertyName: "founders",
                target: "Founder",
                foreignKey: "organizationId",
                uniDirectional: true
              }
            }
          },
          Founder: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              organizationId: {
                name: "organizationId",
                alias: "OrganizationId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Organization"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              OrganizationId: {
                name: "organizationId",
                alias: "OrganizationId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Organization"
              }
            },
            relationships: {
              organizationId: {
                type: "OwnedBy",
                propertyName: "organizationId",
                target: "Organization",
                foreignKey: "organizationId"
              }
            }
          },
          ArrayOfObjectsEntity: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              data: {
                name: "data",
                alias: "Data",
                kind: "object",
                nullable: false,
                schema: arrayOfObjectsSchema
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              Data: {
                name: "data",
                alias: "Data",
                kind: "object",
                nullable: false,
                schema: arrayOfObjectsSchema
              }
            },
            relationships: {}
          },
          ArrayOfUnionsEntity: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              dashboard: {
                name: "dashboard",
                alias: "Dashboard",
                kind: "object",
                nullable: false,
                schema: arrayOfUnionsSchema
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Dashboard: {
                name: "dashboard",
                alias: "Dashboard",
                kind: "object",
                nullable: false,
                schema: arrayOfUnionsSchema
              }
            },
            relationships: {}
          },
          DeepNestedEntity: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              data: {
                name: "data",
                alias: "Data",
                kind: "object",
                nullable: false,
                schema: deeplyNestedSchema
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              Data: {
                name: "data",
                alias: "Data",
                kind: "object",
                nullable: false,
                schema: deeplyNestedSchema
              }
            },
            relationships: {}
          },
          Desk: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              num: {
                name: "num",
                alias: "Num",
                kind: "number",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Num: {
                name: "num",
                alias: "Num",
                kind: "number",
                nullable: false
              }
            },
            relationships: {
              user: {
                type: "HasOne",
                propertyName: "user",
                target: "User",
                foreignKey: "deskId"
              }
            }
          },
          Website: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              }
            },
            relationships: {
              users: {
                type: "HasAndBelongsToMany",
                propertyName: "users",
                target: "User",
                joinTableName: "UserWebsite"
              }
            }
          },
          Employee: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              organizationId: {
                name: "organizationId",
                alias: "OrganizationId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Organization"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              OrganizationId: {
                name: "organizationId",
                alias: "OrganizationId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Organization"
              }
            },
            relationships: {
              organizationId: {
                type: "OwnedBy",
                propertyName: "organizationId",
                target: "Organization",
                foreignKey: "organizationId"
              }
            }
          },
          Warehouse: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              location: {
                name: "location",
                alias: "Location",
                kind: "object",
                nullable: false,
                schema: locationSchema
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              Location: {
                name: "location",
                alias: "Location",
                kind: "object",
                nullable: false,
                schema: locationSchema
              }
            },
            relationships: {
              shipments: {
                type: "HasMany",
                propertyName: "shipments",
                target: "Shipment",
                foreignKey: "warehouseId"
              }
            }
          },
          Shipment: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              destination: {
                name: "destination",
                alias: "Destination",
                kind: "string",
                nullable: false
              },
              dimensions: {
                name: "dimensions",
                alias: "Dimensions",
                kind: "object",
                nullable: false,
                schema: dimensionsSchema
              },
              warehouseId: {
                name: "warehouseId",
                alias: "WarehouseId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Warehouse"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Destination: {
                name: "destination",
                alias: "Destination",
                kind: "string",
                nullable: false
              },
              Dimensions: {
                name: "dimensions",
                alias: "Dimensions",
                kind: "object",
                nullable: false,
                schema: dimensionsSchema
              },
              WarehouseId: {
                name: "warehouseId",
                alias: "WarehouseId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Warehouse"
              }
            },
            relationships: {
              warehouse: {
                type: "BelongsTo",
                propertyName: "warehouse",
                target: "Warehouse",
                foreignKey: "warehouseId"
              }
            }
          },
          DuplicateFieldEntity: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              duplicateFieldObj: {
                name: "duplicateFieldObj",
                alias: "DuplicateFieldObj",
                kind: "object",
                nullable: false,
                schema: duplicateFieldNameSchema
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              DuplicateFieldObj: {
                name: "duplicateFieldObj",
                alias: "DuplicateFieldObj",
                kind: "object",
                nullable: false,
                schema: duplicateFieldNameSchema
              }
            },
            relationships: {}
          },
          Catalog: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              inventory: {
                name: "inventory",
                alias: "Inventory",
                kind: "object",
                nullable: false,
                schema: inventorySchema
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              Inventory: {
                name: "inventory",
                alias: "Inventory",
                kind: "object",
                nullable: false,
                schema: inventorySchema
              }
            },
            relationships: {
              catalogItem: {
                type: "HasOne",
                propertyName: "catalogItem",
                target: "CatalogItem",
                foreignKey: "catalogId"
              }
            }
          },
          CatalogItem: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              description: {
                name: "description",
                alias: "Description",
                kind: "string",
                nullable: false
              },
              catalogId: {
                name: "catalogId",
                alias: "CatalogId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Catalog"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Description: {
                name: "description",
                alias: "Description",
                kind: "string",
                nullable: false
              },
              CatalogId: {
                name: "catalogId",
                alias: "CatalogId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Catalog"
              }
            },
            relationships: {
              catalog: {
                type: "BelongsTo",
                propertyName: "catalog",
                target: "Catalog",
                foreignKey: "catalogId"
              }
            }
          },
          Sponsor: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              inventory: {
                name: "inventory",
                alias: "Inventory",
                kind: "object",
                nullable: false,
                schema: inventorySchema
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              },
              Inventory: {
                name: "inventory",
                alias: "Inventory",
                kind: "object",
                nullable: false,
                schema: inventorySchema
              }
            },
            relationships: {
              festivals: {
                type: "HasAndBelongsToMany",
                propertyName: "festivals",
                target: "Festival",
                joinTableName: "SponsorFestival"
              }
            }
          },
          Festival: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              }
            },
            relationships: {
              sponsors: {
                type: "HasAndBelongsToMany",
                propertyName: "sponsors",
                target: "Sponsor",
                joinTableName: "SponsorFestival"
              }
            }
          },
          DiscriminatedUnionEntity: {
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              payment: {
                name: "payment",
                alias: "Payment",
                kind: "object",
                nullable: false,
                schema: paymentSchema
              },
              nullableUnion: {
                name: "nullableUnion",
                alias: "NullableUnion",
                kind: "object",
                nullable: false,
                schema: nullableUnionSchema
              }
            },
            relationships: {},
            tableAttributes: {
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              NullableUnion: {
                name: "nullableUnion",
                alias: "NullableUnion",
                kind: "object",
                nullable: false,
                schema: nullableUnionSchema
              },
              Payment: {
                name: "payment",
                alias: "Payment",
                kind: "object",
                nullable: false,
                schema: paymentSchema
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              }
            },
            tableClassName: "MockTable"
          },
          Vendor: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                kind: "string",
                nullable: false
              }
            },
            relationships: {
              discovery: {
                type: "HasOne",
                propertyName: "discovery",
                target: "Discovery",
                foreignKey: "vendorId"
              },
              orders: {
                type: "HasMany",
                propertyName: "orders",
                target: "Order",
                foreignKey: "customerId"
              }
            }
          },
          Discovery: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              vendorId: {
                name: "vendorId",
                alias: "VendorId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Vendor"
              },
              details: {
                name: "details",
                alias: "Details",
                kind: "string",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                kind: "string",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                kind: "string",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                kind: "date",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                kind: "date",
                nullable: false
              },
              VendorId: {
                name: "vendorId",
                alias: "VendorId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Vendor"
              },
              Details: {
                name: "details",
                alias: "Details",
                kind: "string",
                nullable: false
              }
            },
            relationships: {
              vendor: {
                type: "BelongsTo",
                propertyName: "vendor",
                target: "Vendor",
                foreignKey: "vendorId"
              }
            },
            idField: "vendorId"
          }
        }
      });
    });
  });

  describe("OtherTable.metadata()", () => {
    it("returns the complete table metadata for OtherTable", () => {
      expect.assertions(1);

      const metadata = OtherTable.metadata();

      expect(metadata).toStrictEqual({
        name: "other-table",
        delimiter: "|",
        defaultAttributes: {
          id: {
            name: "id",
            alias: "id",
            kind: "string",
            nullable: false
          },
          type: {
            name: "type",
            alias: "type",
            kind: "string",
            nullable: false
          },
          createdAt: {
            name: "createdAt",
            alias: "createdAt",
            kind: "date",
            nullable: false
          },
          updatedAt: {
            name: "updatedAt",
            alias: "updatedAt",
            kind: "date",
            nullable: false
          }
        },
        defaultTableAttributes: {
          id: {
            name: "id",
            alias: "id",
            kind: "string",
            nullable: false
          },
          type: {
            name: "type",
            alias: "type",
            kind: "string",
            nullable: false
          },
          createdAt: {
            name: "createdAt",
            alias: "createdAt",
            kind: "date",
            nullable: false
          },
          updatedAt: {
            name: "updatedAt",
            alias: "updatedAt",
            kind: "date",
            nullable: false
          }
        },
        partitionKeyAttribute: {
          name: "myPk",
          alias: "myPk",
          kind: "string",
          nullable: false
        },
        sortKeyAttribute: {
          name: "mySk",
          alias: "mySk",
          kind: "string",
          nullable: false
        },
        entities: {
          Teacher: {
            tableClassName: "OtherTable",
            attributes: {
              id: {
                name: "id",
                alias: "id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "name",
                kind: "string",
                nullable: false
              }
            },
            tableAttributes: {
              id: {
                name: "id",
                alias: "id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "name",
                kind: "string",
                nullable: false
              }
            },
            relationships: {
              courses: {
                type: "HasMany",
                propertyName: "courses",
                target: "Course",
                foreignKey: "teacherId"
              },
              profile: {
                type: "HasOne",
                propertyName: "profile",
                target: "Profile",
                foreignKey: "userId"
              }
            }
          },
          Student: {
            tableClassName: "OtherTable",
            attributes: {
              id: {
                name: "id",
                alias: "id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "name",
                kind: "string",
                nullable: false
              }
            },
            tableAttributes: {
              id: {
                name: "id",
                alias: "id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "name",
                kind: "string",
                nullable: false
              }
            },
            relationships: {
              courses: {
                type: "HasAndBelongsToMany",
                propertyName: "courses",
                target: "Course",
                joinTableName: "StudentCourse"
              },
              profile: {
                type: "HasOne",
                propertyName: "profile",
                target: "Profile",
                foreignKey: "userId"
              },
              grades: {
                type: "HasMany",
                propertyName: "grades",
                target: "Grade",
                foreignKey: "studentId"
              }
            }
          },
          Course: {
            tableClassName: "OtherTable",
            attributes: {
              id: {
                name: "id",
                alias: "id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "name",
                kind: "string",
                nullable: false
              },
              teacherId: {
                name: "teacherId",
                alias: "teacherId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Teacher"
              }
            },
            tableAttributes: {
              id: {
                name: "id",
                alias: "id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                kind: "date",
                nullable: false
              },
              name: {
                name: "name",
                alias: "name",
                kind: "string",
                nullable: false
              },
              teacherId: {
                name: "teacherId",
                alias: "teacherId",
                kind: "foreignKey",
                nullable: true,
                foreignKeyTarget: "Teacher"
              }
            },
            relationships: {
              teacher: {
                type: "BelongsTo",
                propertyName: "teacher",
                target: "Teacher",
                foreignKey: "teacherId"
              },
              assignments: {
                type: "HasMany",
                propertyName: "assignments",
                target: "Assignment",
                foreignKey: "courseId"
              },
              students: {
                type: "HasAndBelongsToMany",
                propertyName: "students",
                target: "Student",
                joinTableName: "StudentCourse"
              }
            }
          },
          Assignment: {
            tableClassName: "OtherTable",
            attributes: {
              id: {
                name: "id",
                alias: "id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                kind: "date",
                nullable: false
              },
              title: {
                name: "title",
                alias: "title",
                kind: "string",
                nullable: false
              },
              courseId: {
                name: "courseId",
                alias: "courseId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Course"
              }
            },
            tableAttributes: {
              id: {
                name: "id",
                alias: "id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                kind: "date",
                nullable: false
              },
              title: {
                name: "title",
                alias: "title",
                kind: "string",
                nullable: false
              },
              courseId: {
                name: "courseId",
                alias: "courseId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Course"
              }
            },
            relationships: {
              course: {
                type: "BelongsTo",
                propertyName: "course",
                target: "Course",
                foreignKey: "courseId"
              },
              grade: {
                type: "HasOne",
                propertyName: "grade",
                target: "Grade",
                foreignKey: "assignmentId"
              }
            }
          },
          Grade: {
            tableClassName: "OtherTable",
            attributes: {
              id: {
                name: "id",
                alias: "id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                kind: "date",
                nullable: false
              },
              gradeValue: {
                name: "gradeValue",
                alias: "LetterValue",
                kind: "string",
                nullable: false
              },
              assignmentId: {
                name: "assignmentId",
                alias: "assignmentId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Assignment"
              },
              studentId: {
                name: "studentId",
                alias: "studentId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Student"
              }
            },
            tableAttributes: {
              id: {
                name: "id",
                alias: "id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                kind: "date",
                nullable: false
              },
              LetterValue: {
                name: "gradeValue",
                alias: "LetterValue",
                kind: "string",
                nullable: false
              },
              assignmentId: {
                name: "assignmentId",
                alias: "assignmentId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Assignment"
              },
              studentId: {
                name: "studentId",
                alias: "studentId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Student"
              }
            },
            relationships: {
              assignment: {
                type: "BelongsTo",
                propertyName: "assignment",
                target: "Assignment",
                foreignKey: "assignmentId"
              },
              student: {
                type: "BelongsTo",
                propertyName: "student",
                target: "Student",
                foreignKey: "studentId"
              }
            }
          },
          Profile: {
            tableClassName: "OtherTable",
            attributes: {
              id: {
                name: "id",
                alias: "id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                kind: "date",
                nullable: false
              },
              lastLogin: {
                name: "lastLogin",
                alias: "lastLogin",
                kind: "date",
                nullable: false
              },
              userId: {
                name: "userId",
                alias: "userId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Student"
              },
              alternateEmail: {
                name: "alternateEmail",
                alias: "alternateEmail",
                kind: "string",
                nullable: true
              }
            },
            tableAttributes: {
              id: {
                name: "id",
                alias: "id",
                kind: "string",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                kind: "string",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                kind: "date",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                kind: "date",
                nullable: false
              },
              lastLogin: {
                name: "lastLogin",
                alias: "lastLogin",
                kind: "date",
                nullable: false
              },
              userId: {
                name: "userId",
                alias: "userId",
                kind: "foreignKey",
                nullable: false,
                foreignKeyTarget: "Student"
              },
              alternateEmail: {
                name: "alternateEmail",
                alias: "alternateEmail",
                kind: "string",
                nullable: true
              }
            },
            relationships: {}
          }
        }
      });
    });
  });
});
