// {{headerComment}}

export type FieldOperators = {
  $in?: string[] | number[];
  $nin?: string[] | number[];
  $gt?: number | string;
  $gte?: number | string;
  $lt?: number | string;
  $lte?: number | string;
  $like?: string;
  $raw?: string;
};

export type FieldFilter<V> = V & FieldOperators;

export type Select = string[];

export type Filter<T = any> = {
  [K in keyof T]?: FieldFilter<T[K]>;
} & {
  $and?: Filter<T>[];
  $or?: Filter<T>[];
};

export type Join = string[];

export default interface VexRequest<T = any> {
    select?: Select;
    filter?: Filter<T>;
    join?: Join;
};