import { Entity, HasAndBelongsToMany } from "../../src/decorators";
import { JoinTable } from "../../src/relationships";
import type { ForeignKey } from "../../src/types";
import { Author, Book, AuthorBook, Customer } from "../integration/mockModels";

describe("JoinTable", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("types", () => {
    describe("add", () => {
      it("will not have type errors when the signature includes one of the joined models and all foreign keys", async () => {
        // @ts-expect-no-error: Signature includes model on join table, and all foreign keys
        await AuthorBook.add(Author, { authorId: "123", bookId: "456" });
        // @ts-expect-no-error: Signature includes model on join table, and all foreign keys
        await AuthorBook.add(Book, { authorId: "123", bookId: "456" });
      });

      it("has an error if the signature includes a model that is not part of the joined table", async () => {
        // @ts-expect-error: Signature includes a model not on the join table
        await AuthorBook.add(Customer, {
          authorId: "123",
          bookId: "456"
        });
      });

      it("has an error if either of the foreign keys are missing", async () => {
        // @ts-expect-error: Missing a foreign key
        await AuthorBook.add(Author, { bookId: "456" });
        // @ts-expect-error: Missing a foreign key
        await AuthorBook.add(Book, { authorId: "123" });
      });

      it("has an error if foreign keys are not valid keys", async () => {
        // @ts-expect-error: Invalid key
        await AuthorBook.add(Author, { bad: "123", bookId: "456" });
      });

      it("has an error if the foreign keys are not strings", async () => {
        // @ts-expect-error: Invalid key value
        await AuthorBook.add(Author, { authorId: 1, bookId: "456" });

        // @ts-expect-error: Invalid key value
        await AuthorBook.add(Author, { authorId: true, bookId: "456" });

        // @ts-expect-error: Invalid key value
        await AuthorBook.add(Author, { authorId: false, bookId: "456" });

        // @ts-expect-error: Invalid key value
        await AuthorBook.add(Author, { authorId: null, bookId: "456" });
      });
    });
  });
});
