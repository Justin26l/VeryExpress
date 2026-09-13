/**
 * Strip the quotes wrapping `'FUNC{{ ... }}'` so the inner code is emitted as
 * runnable JavaScript instead of a string literal.
 *
 * Replaces every block, in one pass. A `.replace()`-inside-`exec()` loop cannot
 * do this: replacing shortens the string while `lastIndex` still points into the
 * pre-replacement text, so all but the first block were skipped.
 *
 * `[\s\S]` (rather than `.`) so multi-line bodies match too.
 *
 * @param content generated source
 */
export function format(content:string){
    return content.replace(/'FUNC{{([\s\S]*?)}}'/g, "$1");
}

export default {
    format
};
