// {{headerComment}}

export type Select = string[];
export type Filter = Record<string, unknown>;
export type Join = string[];

export default interface VexRequest {
    select?: Select;
    filter?: Filter;
    join?: Join;
};