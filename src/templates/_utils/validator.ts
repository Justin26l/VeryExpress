export function checkObjectId(value:string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(value);
}

export default {
    checkObjectId
};
