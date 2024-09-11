export type accessAction = "create" | "read" | "update" | "delete";
export const accessActionArr: accessAction[] = ["create", "read", "update", "delete"];

export interface accessControl< T = accessAction > { 
    [key:string]: T[] 
}

export class _RoleFactory<T = accessAction> {
    private accessControl: accessControl<T> = {};

    constructor(accessControl: accessControl<T>) {
        this.accessControl = accessControl;
    }

    public checkAccess(document: string, access: string): boolean {
        if (this.accessControl[document]) {
            return this.accessControl[document].includes(access as T);
        }
        return false;
    }
    
}