export interface ObjectLiteral {
  [key: string]: any;
}

// TODOD delete if not used
class BaseModel {
  // testing: string = "BLA";
  // static findById<T extends BaseModel>(
  //   this: { new (): T } & typeof BaseModel,
  //   // _where: FindOptionsWhere<T>
  //   id: string
  // ): Promise<T[]> {
  //   return id as any;
  // }
}

export default BaseModel;
