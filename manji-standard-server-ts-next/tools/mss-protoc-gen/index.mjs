#!/usr/bin/env node
/**
 * mss-protoc-gen (Next 版)
 *
 * proto メッセージの `@entity` マーカーから DDD の Entity / Repository interface /
 * Mock / Postgres (Drizzle ORM) 実装を生成する。加えて proto service/rpc から
 * Usecase interface / REST Route Handler / handler-registry を生成する。
 *
 * REST のルーティングは rpc の leading comment に `// @http METHOD /path` を書く。
 * 例: `// @http GET /api/users/{id}` → `src/app/api/users/[id]/route.gen.ts`
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createEcmaScriptPlugin, runNodeJs } from "@bufbuild/protoplugin";
import { localName } from "@bufbuild/protoplugin/ecmascript";

import { render } from "./template.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ENTITY_KINDS = [
  {
    name: "entity",
    tplPath: "generator/entity/output/src/domain/entity/entity.gen.ts.tpl",
    outPath: (kebab) => `src/domain/entity/${kebab}.gen.ts`,
  },
  {
    name: "repository",
    tplPath: "generator/repository/output/src/domain/repository/repository.gen.ts.tpl",
    outPath: (kebab) => `src/domain/repository/${kebab}-repository.gen.ts`,
  },
  {
    name: "mock",
    tplPath: "generator/mock/output/src/domain/repository/mock/mock_repository.gen.ts.tpl",
    outPath: (kebab) => `src/domain/repository/mock/mock-${kebab}-repository.gen.ts`,
  },
  {
    name: "infra_postgres_repository",
    tplPath: "generator/infra_postgres_repository/output/src/infra/repository/postgres_repository.gen.ts.tpl",
    outPath: (kebab) => `src/infra/repository/${kebab}-postgres-repository.gen.ts`,
  },
];

const SERVICE_KINDS = [
  {
    name: "usecase",
    tplPath: "generator/usecase/output/src/usecase/usecase.gen.ts.tpl",
    outPath: (kebab) => `src/usecase/${kebab}-usecase-interface.gen.ts`,
  },
];

const HANDLER_REST_TPL = "generator/handler_rest/output/src/app/route.gen.ts.tpl";
const REGISTRY_TPL = "generator/di/output/src/lib/handler-registry.gen.ts.tpl";

const templates = Object.fromEntries([
  ...[...ENTITY_KINDS, ...SERVICE_KINDS].map((k) => [
    k.name,
    readFileSync(join(__dirname, k.tplPath), "utf8"),
  ]),
  ["handler_rest", readFileSync(join(__dirname, HANDLER_REST_TPL), "utf8")],
  ["di", readFileSync(join(__dirname, REGISTRY_TPL), "utf8")],
]);

const funcs = {
  capitalize: (s) => s.charAt(0).toUpperCase() + s.slice(1),
  tsTestValue,
  drizzleColumn,
};

const plugin = createEcmaScriptPlugin({
  name: "mss-protoc-gen",
  version: "v0.4.0-next",
  generateTs(schema) {
    const entitiesByFullName = new Map();
    for (const file of schema.files) {
      for (const message of file.messages) {
        const ent = parseEntity(message);
        if (ent) entitiesByFullName.set(message.typeName, ent);
      }
    }

    for (const file of schema.files) {
      for (const message of file.messages) {
        const ent = entitiesByFullName.get(message.typeName);
        if (!ent) continue;
        for (const kind of ENTITY_KINDS) {
          const rendered = render(templates[kind.name], ent, funcs);
          const f = schema.generateFile(kind.outPath(ent.Kebab));
          f.print(rendered.trimEnd());
        }
      }
    }

    const allServices = [];
    const routesByPath = new Map();
    for (const file of schema.files) {
      for (const service of file.services) {
        const svc = buildServiceData(service, entitiesByFullName);
        allServices.push(svc);
        for (const kind of SERVICE_KINDS) {
          const rendered = render(templates[kind.name], svc, funcs);
          const f = schema.generateFile(kind.outPath(svc.Kebab));
          f.print(rendered.trimEnd());
        }
        for (const m of svc.Methods) {
          if (!m.Http) continue;
          const key = m.Http.NextPath;
          if (!routesByPath.has(key)) {
            routesByPath.set(key, { NextPath: key, Methods: [], UsedEntities: [] });
          }
          const group = routesByPath.get(key);
          group.Methods.push({
            ...m,
            UsecaseVarName: svc.UsecaseVarName,
            UsecaseTypeName: svc.UsecaseTypeName,
            UsecaseKebab: svc.Kebab,
          });
          if (m.EntityName && !group.UsedEntities.find((e) => e.Name === m.EntityName)) {
            const entRef = svc.UsedEntities.find((e) => e.Name === m.EntityName);
            if (entRef) group.UsedEntities.push(entRef);
          }
        }
      }
    }

    for (const [nextPath, group] of routesByPath) {
      const rendered = render(templates.handler_rest, group, funcs);
      // Next.js は `route.ts` / `route.tsx` / `route.js` のみを Route Handler と認識するため
      // `.gen.ts` は使えない。代わりに先頭の "Code generated" コメントで生成物を明示する。
      const f = schema.generateFile(`src/app${nextPath}/route.ts`);
      f.print(rendered.trimEnd());
    }

    if (allServices.length > 0) {
      allServices.sort((a, b) => a.ServiceName.localeCompare(b.ServiceName));
      const di = { Services: allServices };
      const rendered = render(templates.di, di, funcs);
      const f = schema.generateFile("src/lib/handler-registry.gen.ts");
      f.print(rendered.trimEnd());
    }
  },
});

runNodeJs(plugin);

// ==================== parsing ====================

function hasMarker(text, marker) {
  if (!text) return false;
  for (const line of text.split("\n")) {
    const tokens = line.replace(/^\s*\/\/\s*/, "").trim().split(/\s+/);
    if (tokens.includes(marker)) return true;
  }
  return false;
}

// `// @http METHOD /path` を leading comment から抽出
function parseHttpAnnotation(text) {
  if (!text) return null;
  for (const line of text.split("\n")) {
    const trimmed = line.replace(/^\s*\/\/\s*/, "").trim();
    const match = trimmed.match(/^@http\s+(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s*$/);
    if (match) {
      const method = match[1];
      const urlPath = match[2];
      const nextPath = urlPath.replace(/\{([^}]+)\}/g, "[$1]");
      const pathParams = Array.from(urlPath.matchAll(/\{([^}]+)\}/g)).map((m) => m[1]);
      return { Method: method, Path: urlPath, NextPath: nextPath, PathParams: pathParams };
    }
  }
  return null;
}

function parseEntity(message) {
  const leading = message.getComments().leading ?? "";
  if (!hasMarker(leading, "@entity")) return null;

  const fields = [];
  let pkField = null;
  const uniqueFieldsNonPK = [];

  for (const field of message.fields) {
    const comment = field.getComments().leading ?? "";
    const isPk = hasMarker(comment, "@pk");
    const isUnique = hasMarker(comment, "@unique");
    const isEmail = hasMarker(comment, "@email");
    const isRequired = hasMarker(comment, "@required");
    const isTimestamp = hasMarker(comment, "@timestamp");

    let type = "string";
    let name = localName(field);
    const pbName = name;

    if (isTimestamp) {
      type = "Date";
      name = name.replace(/Unix$/, "");
    } else {
      switch (field.scalar) {
        case 9:
          type = "string";
          break;
        case 5:
        case 3:
        case 13:
        case 4:
          type = "number";
          break;
        case 8:
          type = "boolean";
          break;
        default:
          type = "string";
      }
    }

    const snakeName = camelToSnake(name);
    const spec = { name, pbName, snakeName, type, isPk, isUnique, isEmail, isRequired, isTimestamp };
    fields.push(spec);
    if (isPk) pkField = spec;
    if (isUnique && !isPk) uniqueFieldsNonPK.push(spec);
  }

  if (!pkField) return null;

  const entityName = message.name;
  const lower = lowerFirst(entityName);
  return {
    Name: entityName,
    Kebab: pascalToKebab(entityName),
    LowerFirst: lower,
    Plural: `${lower}s`,
    Fields: fields,
    PKField: pkField,
    UniqueFieldsNonPK: uniqueFieldsNonPK,
  };
}

function buildServiceData(service, entitiesByFullName) {
  const serviceName = service.name;
  const kebab = pascalToKebab(serviceName.replace(/Service$/, ""));
  const baseName = serviceName.replace(/Service$/, "");

  const methods = [];
  const usedEntitiesByName = new Map();
  let anyReturnsEntity = false;

  for (const method of service.methods) {
    const http = parseHttpAnnotation(method.getComments().leading ?? "");
    const m = {
      rpcName: method.name,
      lowerName: lowerFirst(method.name),
      RequestName: method.input.name,
      ResponseName: method.output.name,
      InputTypeName: `${method.name}Input`,
      InputFields: [],
      HasInputFields: method.input.fields.length > 0,
      EntityName: "",
      EntityLowerFirst: "",
      EntityKebab: "",
      ReturnsEntity: false,
      ReturnsList: false,
      ReturnsEmpty: false,
      ResponseField: "",
      Http: http,
      BodyFields: [],
      PathParamFields: [],
    };

    const pathParamNames = http ? http.PathParams : [];

    for (const field of method.input.fields) {
      const fieldName = localName(field);
      let type = "string";
      switch (field.scalar) {
        case 9:
          type = "string";
          break;
        case 5:
        case 3:
        case 13:
        case 4:
          type = "number";
          break;
        case 8:
          type = "boolean";
          break;
        default:
          type = "string";
      }
      const inputField = { name: fieldName, type };
      m.InputFields.push(inputField);
      if (pathParamNames.includes(fieldName)) {
        m.PathParamFields.push(inputField);
      } else {
        m.BodyFields.push(inputField);
      }
    }
    m.HasBodyFields = m.BodyFields.length > 0;
    m.HasPathParams = m.PathParamFields.length > 0;

    if (method.output.fields.length === 1) {
      const resField = method.output.fields[0];
      if (resField.message && entitiesByFullName.has(resField.message.typeName)) {
        const ent = entitiesByFullName.get(resField.message.typeName);
        m.EntityName = ent.Name;
        m.EntityLowerFirst = ent.LowerFirst;
        m.EntityKebab = ent.Kebab;
        m.ResponseField = localName(resField);
        m.EntityFields = ent.Fields;
        if (resField.repeated) {
          m.ReturnsList = true;
        } else {
          m.ReturnsEntity = true;
        }
        if (!usedEntitiesByName.has(ent.Name)) {
          usedEntitiesByName.set(ent.Name, {
            Name: ent.Name,
            LowerFirst: ent.LowerFirst,
            Kebab: ent.Kebab,
            Fields: ent.Fields,
          });
        }
      }
    }
    if (!m.ReturnsEntity && !m.ReturnsList) {
      m.ReturnsEmpty = true;
    }
    if (m.ReturnsEntity || m.ReturnsList) {
      anyReturnsEntity = true;
    }

    methods.push(m);
  }

  const usedEntities = Array.from(usedEntitiesByName.values()).sort((a, b) =>
    a.Name.localeCompare(b.Name),
  );

  return {
    ServiceName: serviceName,
    Kebab: kebab,
    BaseName: baseName,
    UsecaseTypeName: `${baseName}Usecase`,
    UsecaseVarName: lowerFirst(`${baseName}Usecase`),
    Methods: methods,
    UsedEntities: usedEntities,
    AnyReturnsEntity: anyReturnsEntity,
  };
}

// ==================== template funcs ====================

function tsTestValue(field, suffixExpr) {
  if (field.isTimestamp) return "new Date(0)";
  switch (field.type) {
    case "string": {
      const prefix = `${field.name}-`;
      if (field.isEmail) return "`" + prefix + "${" + suffixExpr + "}@example.com`";
      return "`" + prefix + "${" + suffixExpr + "}`";
    }
    case "number":
      return "1";
    case "boolean":
      return "false";
    default:
      return '""';
  }
}

function drizzleColumn(field) {
  const col = field.snakeName;
  let base;
  if (field.isTimestamp) {
    base = `timestamp("${col}", { withTimezone: true, mode: "date" })`;
  } else if (field.type === "number") {
    base = `bigint("${col}", { mode: "number" })`;
  } else if (field.type === "boolean") {
    base = `boolean("${col}")`;
  } else {
    base = `text("${col}")`;
  }
  if (field.isPk) return `${base}.primaryKey()`;
  const mods = [];
  if (field.isUnique) mods.push(".unique()");
  mods.push(".notNull()");
  return base + mods.join("");
}

// ==================== helpers ====================

function pascalToKebab(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function camelToSnake(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function lowerFirst(s) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
