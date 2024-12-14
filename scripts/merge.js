const fs = require('fs');
const DiffMatchPatch = require('diff-match-patch');
const dmp = new DiffMatchPatch();

async function merge(currentFilePath, incomingNewFilePath, incomingOldFilePath, outFilePath) {
    const current = fs.readFileSync(currentFilePath, 'utf8');
    const incomingOld = fs.readFileSync(incomingOldFilePath, 'utf8');
    const incomingNew = fs.readFileSync(incomingNewFilePath, 'utf8');

    // diff incoming old and current
    // find manual changes in current file
    let diffOld = dmp.diff_main(incomingOld, current);
    dmp.diff_cleanupSemantic(diffOld);
    diffOld = diff_LineMode(diffOld);
    // console.log("\n===== diffOld =====", diffOld)

    // diff incoming new and current
    // find new update in incomming file
    let diffNew = dmp.diff_main(current, incomingNew);
    dmp.diff_cleanupSemantic(diffNew);
    diffNew = diff_LineMode(diffNew);
    console.log("\n===== diffNew =====", diffNew);

    // console.log("duck")
    // loop diffNew if diff is found in diffOld then pop diff
    for (let i = 0; i < diffNew.length; i++) {
        const newDiff = diffNew[i];

        let found = false;

        for (let j = 0; j < diffOld.length; j++) {
            const oldDiff = diffOld[j];

            if (newDiff[0] == 0) {
                found = true;
                break;
            }
            // else {
            //     console.log([i,j], newDiff, oldDiff)
            // };

            if (
                ((newDiff[0] == -1 && oldDiff[0] == 1) || (newDiff[0] == 1 && oldDiff[0] == -1)) &&
                compareWithoutSymbol(newDiff[1], oldDiff[1])
            ) {
                found = true;
                if (newDiff[0] == -1) {
                    diffNew[i - 1][1] += newDiff[1];
                    // console.log("> added to previous diff", diffNew[i - 1][1]);
                };
                // console.log("> deleted", newDiff[1]);
                diffNew.splice(i, 1);
                diffOld.splice(j, 1);
                i -= 1;
                break;
            };
        }

        // if(!found){
        //   console.log("> not found", newDiff);
        //   newDiff[1] = `\n<<<<<<< v1\n=======\n${newDiff[1]}\n>>>>>>> v2`;
        // };

    };

    // log updated diffNew
    console.log("\n===== updated diffNew =====", diffNew);
    diffNew.forEach((diff, index) => {
        const color = diff[0] == -1 ? '\x1b[31m' : (diff[0] == 1 ? '\x1b[32m' : '\x1b[0m');
        console.log(color, diff[1]);
    });


    // apply diffNew
    const patches = dmp.patch_make(diffNew);
    const [patchedText, results] = dmp.patch_apply(patches, current);
    // console.log("\n===== patches =====", patchedText)

    // Save the merged file
    fs.writeFileSync(outFilePath, patchedText, 'utf8');
}

function diff_LineMode(diffs = [[0,''],[0,'']]) {
    for (let i = 0; i < diffs.length; i++) {
        let diff = diffs[i];
        const [operation, text] = diff;

        const split = /\n/gm.test(text);
        if(split){
            // const lines = text.split('\n');
            const lines = text.split(/\n/gm);
            console.log(">>lines", lines);

            const currentLines = [];
            lines.forEach((line, index) => {

                if(index !== lines.length - 1) {
                    line += '\n';
                };

                currentLines.push([operation, line]);
            });

            diffs = [ ...diffs.slice(0, i), ...currentLines, ...diffs.slice(i+1)];
            // console.log(">>>>>", diffs);
            i += currentLines.length;
        }
    }

    return diffs;
}

function compareWithoutSymbol(text1, text2){
    let t1 = text1;
    t1 = text1.replaceAll(/\r/g, '');
    t1 = text1.replaceAll(/\n/g, '');

    let t2 = text2;
    t2 = text2.replaceAll(/\r/g, '');
    t2 = text2.replaceAll(/\n/g, '');

    return t1 == t2;
}

merge('Current.ts', 'IncomingNew.ts', 'IncomingOld.ts', 'Merged.ts');