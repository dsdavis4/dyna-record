import { MockTable, OtherTable } from "../integration/mockModels";

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
            nullable: false
          },
          type: {
            name: "type",
            alias: "Type",
            nullable: false
          },
          createdAt: {
            name: "createdAt",
            alias: "CreatedAt",
            nullable: false
          },
          updatedAt: {
            name: "updatedAt",
            alias: "UpdatedAt",
            nullable: false
          }
        },
        defaultTableAttributes: {
          Id: {
            name: "id",
            alias: "Id",
            nullable: false
          },
          Type: {
            name: "type",
            alias: "Type",
            nullable: false
          },
          CreatedAt: {
            name: "createdAt",
            alias: "CreatedAt",
            nullable: false
          },
          UpdatedAt: {
            name: "updatedAt",
            alias: "UpdatedAt",
            nullable: false
          }
        },
        partitionKeyAttribute: {
          name: "pk",
          alias: "PK",
          nullable: false
        },
        sortKeyAttribute: {
          name: "sk",
          alias: "SK",
          nullable: false
        },
        entities: {
          Order: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              customerId: {
                name: "customerId",
                alias: "CustomerId",
                nullable: false,
                foreignKeyTarget: "Customer"
              },
              paymentMethodId: {
                name: "paymentMethodId",
                alias: "PaymentMethodId",
                nullable: false,
                foreignKeyTarget: "PaymentMethod"
              },
              orderDate: {
                name: "orderDate",
                alias: "OrderDate",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              CustomerId: {
                name: "customerId",
                alias: "CustomerId",
                nullable: false,
                foreignKeyTarget: "Customer"
              },
              PaymentMethodId: {
                name: "paymentMethodId",
                alias: "PaymentMethodId",
                nullable: false,
                foreignKeyTarget: "PaymentMethod"
              },
              OrderDate: {
                name: "orderDate",
                alias: "OrderDate",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              paymentMethodId: {
                name: "paymentMethodId",
                alias: "PaymentMethodId",
                nullable: false,
                foreignKeyTarget: "PaymentMethod"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              PaymentMethodId: {
                name: "paymentMethodId",
                alias: "PaymentMethodId",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              lastFour: {
                name: "lastFour",
                alias: "LastFour",
                nullable: false
              },
              customerId: {
                name: "customerId",
                alias: "CustomerId",
                nullable: false,
                foreignKeyTarget: "Customer"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              LastFour: {
                name: "lastFour",
                alias: "LastFour",
                nullable: false
              },
              CustomerId: {
                name: "customerId",
                alias: "CustomerId",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              address: {
                name: "address",
                alias: "Address",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              Address: {
                name: "address",
                alias: "Address",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              email: {
                name: "email",
                alias: "Email",
                nullable: false
              },
              phone: {
                name: "phone",
                alias: "Phone",
                nullable: true
              },
              customerId: {
                name: "customerId",
                alias: "CustomerId",
                nullable: true,
                foreignKeyTarget: "Customer"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Email: {
                name: "email",
                alias: "Email",
                nullable: false
              },
              Phone: {
                name: "phone",
                alias: "Phone",
                nullable: true
              },
              CustomerId: {
                name: "customerId",
                alias: "CustomerId",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              ownerId: {
                name: "ownerId",
                alias: "OwnerId",
                nullable: true,
                foreignKeyTarget: "Person"
              },
              adoptedDate: {
                name: "adoptedDate",
                alias: "AdoptedDate",
                nullable: true
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              OwnerId: {
                name: "ownerId",
                alias: "OwnerId",
                nullable: true,
                foreignKeyTarget: "Person"
              },
              AdoptedDate: {
                name: "adoptedDate",
                alias: "AdoptedDate",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              mlsNum: {
                name: "mlsNum",
                alias: "MLS#",
                nullable: false
              },
              neighborhood: {
                name: "neighborhood",
                alias: "Neighborhood",
                nullable: true
              },
              personId: {
                name: "personId",
                alias: "PersonId",
                nullable: true,
                foreignKeyTarget: "Person"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              "MLS#": {
                name: "mlsNum",
                alias: "MLS#",
                nullable: false
              },
              Neighborhood: {
                name: "neighborhood",
                alias: "Neighborhood",
                nullable: true
              },
              PersonId: {
                name: "personId",
                alias: "PersonId",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              state: {
                name: "state",
                alias: "State",
                nullable: false
              },
              homeId: {
                name: "homeId",
                alias: "HomeId",
                nullable: false,
                foreignKeyTarget: "Home"
              },
              phoneBookId: {
                name: "phoneBookId",
                alias: "PhoneBookId",
                nullable: false,
                foreignKeyTarget: "PhoneBook"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              State: {
                name: "state",
                alias: "State",
                nullable: false
              },
              HomeId: {
                name: "homeId",
                alias: "HomeId",
                nullable: false,
                foreignKeyTarget: "Home"
              },
              PhoneBookId: {
                name: "phoneBookId",
                alias: "PhoneBookId",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              edition: {
                name: "edition",
                alias: "Edition",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Edition: {
                name: "edition",
                alias: "Edition",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              numPages: {
                name: "numPages",
                alias: "NumPages",
                nullable: false
              },
              ownerId: {
                name: "ownerId",
                alias: "PersonId",
                nullable: true,
                foreignKeyTarget: "Person"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              NumPages: {
                name: "numPages",
                alias: "NumPages",
                nullable: false
              },
              PersonId: {
                name: "ownerId",
                alias: "PersonId",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              stringAttribute: {
                name: "stringAttribute",
                alias: "stringAttribute",
                nullable: false
              },
              nullableStringAttribute: {
                name: "nullableStringAttribute",
                alias: "nullableStringAttribute",
                nullable: true
              },
              dateAttribute: {
                name: "dateAttribute",
                alias: "dateAttribute",
                nullable: false
              },
              nullableDateAttribute: {
                name: "nullableDateAttribute",
                alias: "nullableDateAttribute",
                nullable: true
              },
              boolAttribute: {
                name: "boolAttribute",
                alias: "boolAttribute",
                nullable: false
              },
              nullableBoolAttribute: {
                name: "nullableBoolAttribute",
                alias: "nullableBoolAttribute",
                nullable: true
              },
              numberAttribute: {
                name: "numberAttribute",
                alias: "numberAttribute",
                nullable: false
              },
              nullableNumberAttribute: {
                name: "nullableNumberAttribute",
                alias: "nullableNumberAttribute",
                nullable: true
              },
              foreignKeyAttribute: {
                name: "foreignKeyAttribute",
                alias: "foreignKeyAttribute",
                nullable: false,
                foreignKeyTarget: "Customer"
              },
              nullableForeignKeyAttribute: {
                name: "nullableForeignKeyAttribute",
                alias: "nullableForeignKeyAttribute",
                nullable: true,
                foreignKeyTarget: "Customer"
              },
              enumAttribute: {
                name: "enumAttribute",
                alias: "enumAttribute",
                nullable: false
              },
              nullableEnumAttribute: {
                name: "nullableEnumAttribute",
                alias: "nullableEnumAttribute",
                nullable: true
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              stringAttribute: {
                name: "stringAttribute",
                alias: "stringAttribute",
                nullable: false
              },
              nullableStringAttribute: {
                name: "nullableStringAttribute",
                alias: "nullableStringAttribute",
                nullable: true
              },
              dateAttribute: {
                name: "dateAttribute",
                alias: "dateAttribute",
                nullable: false
              },
              nullableDateAttribute: {
                name: "nullableDateAttribute",
                alias: "nullableDateAttribute",
                nullable: true
              },
              boolAttribute: {
                name: "boolAttribute",
                alias: "boolAttribute",
                nullable: false
              },
              nullableBoolAttribute: {
                name: "nullableBoolAttribute",
                alias: "nullableBoolAttribute",
                nullable: true
              },
              numberAttribute: {
                name: "numberAttribute",
                alias: "numberAttribute",
                nullable: false
              },
              nullableNumberAttribute: {
                name: "nullableNumberAttribute",
                alias: "nullableNumberAttribute",
                nullable: true
              },
              foreignKeyAttribute: {
                name: "foreignKeyAttribute",
                alias: "foreignKeyAttribute",
                nullable: false,
                foreignKeyTarget: "Customer"
              },
              nullableForeignKeyAttribute: {
                name: "nullableForeignKeyAttribute",
                alias: "nullableForeignKeyAttribute",
                nullable: true,
                foreignKeyTarget: "Customer"
              },
              enumAttribute: {
                name: "enumAttribute",
                alias: "enumAttribute",
                nullable: false
              },
              nullableEnumAttribute: {
                name: "nullableEnumAttribute",
                alias: "nullableEnumAttribute",
                nullable: true
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              email: {
                name: "email",
                alias: "Email",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              orgId: {
                name: "orgId",
                alias: "OrgId",
                nullable: true,
                foreignKeyTarget: "Organization"
              },
              deskId: {
                name: "deskId",
                alias: "DeskId",
                nullable: true,
                foreignKeyTarget: "Desk"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Email: {
                name: "email",
                alias: "Email",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              OrgId: {
                name: "orgId",
                alias: "OrgId",
                nullable: true,
                foreignKeyTarget: "Organization"
              },
              DeskId: {
                name: "deskId",
                alias: "DeskId",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              organizationId: {
                name: "organizationId",
                alias: "OrganizationId",
                nullable: false,
                foreignKeyTarget: "Organization"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              OrganizationId: {
                name: "organizationId",
                alias: "OrganizationId",
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
          Desk: {
            tableClassName: "MockTable",
            attributes: {
              id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              num: {
                name: "num",
                alias: "Num",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Num: {
                name: "num",
                alias: "Num",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                nullable: false
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              organizationId: {
                name: "organizationId",
                alias: "OrganizationId",
                nullable: true,
                foreignKeyTarget: "Organization"
              }
            },
            tableAttributes: {
              Id: {
                name: "id",
                alias: "Id",
                nullable: false
              },
              Type: {
                name: "type",
                alias: "Type",
                nullable: false
              },
              CreatedAt: {
                name: "createdAt",
                alias: "CreatedAt",
                nullable: false
              },
              UpdatedAt: {
                name: "updatedAt",
                alias: "UpdatedAt",
                nullable: false
              },
              Name: {
                name: "name",
                alias: "Name",
                nullable: false
              },
              OrganizationId: {
                name: "organizationId",
                alias: "OrganizationId",
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
            nullable: false
          },
          type: {
            name: "type",
            alias: "type",
            nullable: false
          },
          createdAt: {
            name: "createdAt",
            alias: "createdAt",
            nullable: false
          },
          updatedAt: {
            name: "updatedAt",
            alias: "updatedAt",
            nullable: false
          }
        },
        defaultTableAttributes: {
          id: {
            name: "id",
            alias: "id",
            nullable: false
          },
          type: {
            name: "type",
            alias: "type",
            nullable: false
          },
          createdAt: {
            name: "createdAt",
            alias: "createdAt",
            nullable: false
          },
          updatedAt: {
            name: "updatedAt",
            alias: "updatedAt",
            nullable: false
          }
        },
        partitionKeyAttribute: {
          name: "myPk",
          alias: "myPk",
          nullable: false
        },
        sortKeyAttribute: {
          name: "mySk",
          alias: "mySk",
          nullable: false
        },
        entities: {
          Teacher: {
            tableClassName: "OtherTable",
            attributes: {
              id: {
                name: "id",
                alias: "id",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "name",
                nullable: false
              }
            },
            tableAttributes: {
              id: {
                name: "id",
                alias: "id",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "name",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "name",
                nullable: false
              }
            },
            tableAttributes: {
              id: {
                name: "id",
                alias: "id",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "name",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "name",
                nullable: false
              },
              teacherId: {
                name: "teacherId",
                alias: "teacherId",
                nullable: true,
                foreignKeyTarget: "Teacher"
              }
            },
            tableAttributes: {
              id: {
                name: "id",
                alias: "id",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                nullable: false
              },
              name: {
                name: "name",
                alias: "name",
                nullable: false
              },
              teacherId: {
                name: "teacherId",
                alias: "teacherId",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                nullable: false
              },
              title: {
                name: "title",
                alias: "title",
                nullable: false
              },
              courseId: {
                name: "courseId",
                alias: "courseId",
                nullable: false,
                foreignKeyTarget: "Course"
              }
            },
            tableAttributes: {
              id: {
                name: "id",
                alias: "id",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                nullable: false
              },
              title: {
                name: "title",
                alias: "title",
                nullable: false
              },
              courseId: {
                name: "courseId",
                alias: "courseId",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                nullable: false
              },
              gradeValue: {
                name: "gradeValue",
                alias: "LetterValue",
                nullable: false
              },
              assignmentId: {
                name: "assignmentId",
                alias: "assignmentId",
                nullable: false,
                foreignKeyTarget: "Assignment"
              },
              studentId: {
                name: "studentId",
                alias: "studentId",
                nullable: false,
                foreignKeyTarget: "Student"
              }
            },
            tableAttributes: {
              id: {
                name: "id",
                alias: "id",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                nullable: false
              },
              LetterValue: {
                name: "gradeValue",
                alias: "LetterValue",
                nullable: false
              },
              assignmentId: {
                name: "assignmentId",
                alias: "assignmentId",
                nullable: false,
                foreignKeyTarget: "Assignment"
              },
              studentId: {
                name: "studentId",
                alias: "studentId",
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
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                nullable: false
              },
              lastLogin: {
                name: "lastLogin",
                alias: "lastLogin",
                nullable: false
              },
              userId: {
                name: "userId",
                alias: "userId",
                nullable: false,
                foreignKeyTarget: "Student"
              },
              alternateEmail: {
                name: "alternateEmail",
                alias: "alternateEmail",
                nullable: true
              }
            },
            tableAttributes: {
              id: {
                name: "id",
                alias: "id",
                nullable: false
              },
              type: {
                name: "type",
                alias: "type",
                nullable: false
              },
              createdAt: {
                name: "createdAt",
                alias: "createdAt",
                nullable: false
              },
              updatedAt: {
                name: "updatedAt",
                alias: "updatedAt",
                nullable: false
              },
              lastLogin: {
                name: "lastLogin",
                alias: "lastLogin",
                nullable: false
              },
              userId: {
                name: "userId",
                alias: "userId",
                nullable: false,
                foreignKeyTarget: "Student"
              },
              alternateEmail: {
                name: "alternateEmail",
                alias: "alternateEmail",
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
