/**
 * - apply funtion calling syntax FUNC{{...}}
 * @param content 
 * @returns 
 */
export function format(content:string){

    // format function calling syntax
    const regex = /'FUNC{{(.*?)}}'/g;
    let match;
    while (match = regex.exec(content)) {
        // replace with content in {{ }} keep
        content = content.replace(match[0], match[1]);
    }

    return content;
}

export default {
    format
}
