export type accessAction = "create" | "read" | "update" | "delete" | "search";
export const accessActionArr: accessAction[] = ["create", "read", "update", "delete", "search"];

export interface accessObject< T = accessAction > { 
    [key:string]: T[] 
};

export class Role<T = accessAction> {
    private access: accessObject<T> = {};

    constructor(access: accessObject<T>) {
        this.access = access;
    };

    public checkAccess(document: string, action: string): boolean {
        if (this.access[document]) {
            return this.access[document].includes(action as T);
        };

        return false;
    }
    
}