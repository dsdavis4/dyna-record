type Brand<K, T> = K & { __brand: T };

export type SortKey = Brand<string, "SortKey">;
export type PrimaryKey = Brand<string, "PrimaryKey">;

// TODO... after I know more about typings. I should Make a ForeignKey type
// This could be used for table attributes, better typing etc.
// I could enfoce uuid like below
// It could be a UUID https://stackoverflow.com/questions/37144672/guid-uuid-type-in-typescript
// export type ForeignKey = Brand<string, "ForeignKey">;
