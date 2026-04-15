import knexTemplate from "./knex.template";

import utils from "./../../utils";
import log from "./../../utils/logger";

import * as types from "./../../types/types";

/**
 * compile jsonschema to knex migration source code
 * @param options
 */
export async function compile(options: {
  jsonSchema: types.jsonSchema,
  outDir: string,
  compilerOptions: types.compilerOptions,
}): Promise<void> {
  const schema = options.jsonSchema as types.jsonSchema;
  if (schema.type !== "object") {
    throw new Error("Knex generator: root schema must be object");
  }

  const schemaConfig = schema["x-documentConfig"] || { documentName: "Unknown" };
  const documentName = schemaConfig.documentName || "Unknown";

  log.process(`Knex : ${documentName}`);

  const props = schema.properties || {};
  type TableDef = { name: string; columns: string[]; indexes: string[]; foreigns: string[] };
  const tables: TableDef[] = [];

  function getOrCreateTable(tableName: string): TableDef {
    tableName = tableName.toLowerCase();
    let t = tables.find((x) => x.name === tableName);
    if (!t) {
      t = { name: tableName, columns: [], indexes: [], foreigns: [] };
      tables.push(t);
    }
    return t;
  }

  const mainTableName = documentName.toLowerCase();
  // ensure main table exists
  getOrCreateTable(mainTableName);

  const isArrayLike = (p: types.jsonSchemaPropsItem | undefined) => Boolean(p && (p.type === "array" || (p.type === "json" && p.items)));
  const isObjectLike = (p: types.jsonSchemaPropsItem | undefined) => Boolean(p && (p.type === "object" || (p.type === "json" && p.properties)));

  function addPrimitiveColumnToTable(tbl: TableDef, colName: string, prop: types.jsonSchemaPropsItem | undefined, tblName: string) {
    if (!prop) return;
    // avoid duplicate column
    if (tbl.columns.some((c) => c.includes(`'${colName}'`))) return;

    // determine column type
    let line = "";
    const tname = tblName;
    switch (prop.type) {
      case "string":
        if (prop.maxLength) {
          line = `      table.string('${colName}', ${prop.maxLength})`;
        } else {
          line = `      table.string('${colName}')`;
        }
        break;
      case "integer":
        line = `      table.integer('${colName}')`;
        break;
      case "number":
        line = `      table.float('${colName}')`;
        break;
      case "boolean":
        line = `      table.boolean('${colName}')`;
        break;
      case "array":
      case "object":
      case "json":
        line = `      table.json('${colName}')`;
        break;
      default:
        line = `      table.specificType('${colName}', 'text')`;
    }

    if (prop.required === true || (Array.isArray(schema.required) && schema.required.includes(colName))) {
      line += `.notNullable()`;
    }

    if (prop.default !== undefined) {
      const def = JSON.stringify(prop.default);
      line += `.defaultTo(${def})`;
    }

    line += ";";
    tbl.columns.push(line);

    if (prop.index) {
      tbl.indexes.push(`    table.index(['${colName}'], 'idx_${tbl.name}_${colName}');`);
    }

    if (prop["x-foreignKey"]) {
      const ref = prop["x-foreignValue"]?.[0] || "id";
      tbl.foreigns.push(`    table.foreign('${colName}').references('${ref}').inTable('${prop["x-foreignKey"]}');`);
    }
  }

  function processProperties(props: { [key: string]: types.jsonSchemaPropsItem } | undefined, parentTable: string) {
    if (!props) return;
    const tbl = getOrCreateTable(parentTable);
    for (const key of Object.keys(props)) {
      const p = props[key];

      // explicit foreign key to another table -> keep as FK column in parent
      if (p && p["x-foreignKey"]) {
        addPrimitiveColumnToTable(tbl, key, p, parentTable);
        continue;
      }

      // normalize nested structures into child tables when enabled
      if ((isObjectLike(p) || isArrayLike(p))) {
        const childName = `${parentTable}_${key}`.toLowerCase();
        const child = getOrCreateTable(childName);

        // ensure parent_id column on child
        if (!child.columns.some((c) => c.includes(`'${parentTable}_id'`))) {
          child.columns.push(`      table.integer('${parentTable}_id').unsigned().notNullable();`);
          child.foreigns.push(`    table.foreign('${parentTable}_id').references('id').inTable('${parentTable}');`);
        }

        if (isArrayLike(p)) {
          const items = p.items || {} as types.jsonSchemaPropsItem;
          if (isObjectLike(items) || items.properties) {
            // add children columns from item properties
            const itemProps = items.properties || {};
            for (const ik of Object.keys(itemProps)) {
              addPrimitiveColumnToTable(child, ik, itemProps[ik], childName);
            }
            // recurse into deeper nested items
            for (const ik of Object.keys(itemProps)) {
              if (isObjectLike(itemProps[ik]) || isArrayLike(itemProps[ik])) {
                processProperties({ [ik]: itemProps[ik] } as any, childName);
              }
            }
          } else {
            // primitive array -> value column
            addPrimitiveColumnToTable(child, 'value', items, childName);
          }
        }
        else if (isObjectLike(p)) {
          const objProps = p.properties || {};
          for (const ik of Object.keys(objProps)) {
            addPrimitiveColumnToTable(child, ik, objProps[ik], childName);
          }
          // recurse for deeper nested
          for (const ik of Object.keys(objProps)) {
            if (isObjectLike(objProps[ik]) || isArrayLike(objProps[ik])) {
              processProperties({ [ik]: objProps[ik] } as any, childName);
            }
          }
        }
      }
      else {
        // primitive or non-normalized nested -> column on parent
        addPrimitiveColumnToTable(tbl, key, p, parentTable);
      }
    }
  }

  processProperties(schema.properties, mainTableName);

  const outPath = `${options.outDir}/${documentName}Table.gen.ts`;
  utils.common.writeFile("Knex",
    outPath,
    knexTemplate({
      documentName,
      tables,
      compilerOptions: options.compilerOptions,
    })
  );
}

export default {
  compile,
};
