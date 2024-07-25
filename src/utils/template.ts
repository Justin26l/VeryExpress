/**
 * - apply function calling syntax FUNC{{...}}
 * @param content 
 * @returns 
 */
export function format(content:string){
    // format function calling syntax
    const regex = /'FUNC{{(.*?)}}'/g;
    let match;

    match = regex.exec(content);
    while (match != null) {
        content = content.replace(match[0], match[1]);
        match = regex.exec(content);
    }

    return content;
}

export default {
    format
};
