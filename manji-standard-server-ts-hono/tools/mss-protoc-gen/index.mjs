#!/usr/bin/env node
/**
 * mss-protoc-gen
 *
 * proto メッセージの `@entity` マーカーから DDD の Entity / Repository interface /
 * Mock / Postgres (Drizzle ORM) 実装を生成する。加えて proto service/rpc から
 * Usecase interface / Connect Handler / handler-registry を生成する。
 *
 * テンプレートは `generator/<kind>/output/<ターゲットパス>/<name>.tpl` に格納。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createEcmaScriptPlugin, runNodeJs } from "@bufbuild/protoplugin";
import { localName } from "@bufbuild/protoplugin/ecmascript";

import { render } from "./template.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// エンティティ 1 つにつき 1 ファイル出す kind
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

// service 1 つにつき 1 ファイル出す kind
const SERVICE_KINDS = [
  {
    name: "usecase",
    tplPath: "generator/usecase/output/src/usecase/usecase.gen.ts.tpl",
    outPath: (kebab) => `src/usecase/${kebab}-usecase-interface.gen.ts`,
  },
  {
    name: "handler_rest",
    tplPath: "generator/handler_rest/output/src/handler/handler.gen.ts.tpl",
    outPath: (kebab) => `src/handler/${kebab}-handler.gen.ts`,
  },
];

// プロジェクト全体で 1 ファイル出す kind（DI 配線）
const PROJECT_KINDS = [
  {
    name: "di",
    tplPath: "generator/di/output/src/lib/handler-registry.gen.ts.tpl",
    outPath: () => "src/lib/handler-registry.gen.ts",
  },
];

const templates = Object.fromEntries(
  [...ENTITY_KINDS, ...SERVICE_KINDS, ...PROJECT_KINDS].map((k) => [
    k.name,
    readFileSync(join(__dirname, k.tplPath), "utf8"),
  ]),
);

const funcs = {
  capitalize: (s) => s.charAt(0).toUpperCase() + s.slice(1),
  tsTestValue,
  drizzleColumn,
};

const plugin = createEcmaScriptPlugin({
  name: "mss-protoc-gen",
  version: "v0.4.0",
  generateTs(schema) {
    // Pass 1: 全 @entity を収集（service パースで参照）
    const entitiesByFullName = new Map();
    for (const file of schema.files) {
      for (const message of file.messages) {
        const ent = parseEntity(message);
        if (ent) {
          entitiesByFullName.set(message.typeName, ent);
        }
      }
    }

    // Pass 2: エンティティ kind
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

    // Pass 3: service kind
    const allServices = [];
    for (const file of schema.files) {
      for (const service of file.services) {
        const svc = buildServiceData(service, file, entitiesByFullName);
        allServices.push(svc);
        for (const kind of SERVICE_KINDS) {
          const rendered = render(templates[kind.name], svc, funcs);
          const f = schema.generateFile(kind.outPath(svc.Kebab));
          f.print(rendered.trimEnd());
        }
      }
    }

    // Pass 4: project kind（DI 配線）
    if (allServices.length > 0) {
      allServices.sort((a, b) => a.ServiceName.localeCompare(b.ServiceName));
      // Route を平坦化（テンプレートエンジンに入れ子変数がないので、全 route を 1 件の配列に集約）
      const routes = [];
      for (const svc of allServices) {
        for (const m of svc.Methods) {
          if (!m.Http) continue;
          routes.push({
            HttpMethodLower: m.Http.MethodLower,
            HonoPath: m.Http.HonoPath,
            HandlerVarName: svc.HandlerVarName,
            MethodName: m.lowerName,
          });
        }
      }
      const di = { Services: allServices, Routes: routes };
      for (const kind of PROJECT_KINDS) {
        const rendered = render(templates[kind.name], di, funcs);
        const f = schema.generateFile(kind.outPath());
        f.print(rendered.trimEnd());
      }
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

// `// @http METHOD /path` を抽出。Hono は `:name` 形式のパスパラメータを受け付けるので
// `{name}` → `:name` 変換済みの honoPath も返す。
function parseHttpAnnotation(text) {
  if (!text) return null;
  for (const line of text.split("\n")) {
    const trimmed = line.replace(/^\s*\/\/\s*/, "").trim();
    const match = trimmed.match(/^@http\s+(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s*$/);
    if (match) {
      const method = match[1];
      const urlPath = match[2];
      const honoPath = urlPath.replace(/\{([^}]+)\}/g, ":$1");
      const pathParams = Array.from(urlPath.matchAll(/\{([^}]+)\}/g)).map((m) => m[1]);
      return { Method: method, MethodLower: method.toLowerCase(), Path: urlPath, HonoPath: honoPath, PathParams: pathParams };
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

function buildServiceData(service, file, entitiesByFullName) {
  void file; // REST 生成では proto package 情報は不要
  const serviceName = service.name;
  const kebab = pascalToKebab(serviceName.replace(/Service$/, ""));
  const baseName = serviceName.replace(/Service$/, "");
  const handlerClassName = `${baseName}RestHandler`;

  const methods = [];
  const usedEntitiesByName = new Map();
  let anyReturnsEntity = false;

  for (const method of service.methods) {
    const http = parseHttpAnnotation(method.getComments().leading ?? "");
    const m = {
      rpcName: method.name,
      lowerName: lowerFirst(method.name),
      InputTypeName: `${method.name}Input`,
      InputFields: [],
      BodyFields: [],
      PathParamFields: [],
      HasInputFields: method.input.fields.length > 0,
      HasBodyFields: false,
      HasPathParams: false,
      EntityName: "",
      EntityLowerFirst: "",
      ReturnsEntity: false,
      ReturnsList: false,
      ReturnsEmpty: false,
      Http: http,
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

    // Response 形状判定（単一フィールドが @entity メッセージならマップ）
    if (method.output.fields.length === 1) {
      const resField = method.output.fields[0];
      if (resField.message && entitiesByFullName.has(resField.message.typeName)) {
        const ent = entitiesByFullName.get(resField.message.typeName);
        m.EntityName = ent.Name;
        m.EntityLowerFirst = ent.LowerFirst;
        m.ResponseField = localName(resField);
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
    HandlerClassName: handlerClassName,
    HandlerVarName: `${lowerFirst(baseName)}Handler`,
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
