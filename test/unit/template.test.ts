import { describe, expect, it } from "vitest";

import { format } from "../../src/utils/template";

/**
 * `FUNC{{ }}` is the escape hatch that embeds runnable JS in generated output.
 * If this regresses, every generated controller silently emits a string literal
 * where a function was intended — so it is worth pinning exactly.
 */
describe("template.format", () => {
    it("strips the wrapping quotes around a FUNC{{ }} block", () => {
        const input = "const x = 'FUNC{{ () => 1 }}';";
        expect(format(input)).toBe("const x =  () => 1 ;");
    });

    /**
     * Regression guard: the previous implementation replaced only the first
     * block, because it called `.replace()` (shrinking the string) while the
     * regex's `lastIndex` still indexed the pre-replacement text.
     */
    it("handles several FUNC{{ }} blocks in one document", () => {
        const input = "a = 'FUNC{{ f() }}';\nb = 'FUNC{{ g() }}';";
        expect(format(input)).toBe("a =  f() ;\nb =  g() ;");
    });

    it("strips a multi-line FUNC{{ }} body", () => {
        const input = "const x = 'FUNC{{ () => {\n    return 1;\n} }}';";
        expect(format(input)).toBe("const x =  () => {\n    return 1;\n} ;");
    });

    it("leaves ordinary content untouched", () => {
        const input = "export class UserController {}\n";
        expect(format(input)).toBe(input);
    });

    it("leaves a {{placeholder}} alone — that is a separate mechanism", () => {
        const input = "const name = \"{{documentName}}\";";
        expect(format(input)).toBe(input);
    });

    it("does not touch FUNC{{ }} that is not quoted", () => {
        const input = "FUNC{{ raw }}";
        expect(format(input)).toBe(input);
    });
});
