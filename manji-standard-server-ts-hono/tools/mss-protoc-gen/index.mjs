#!/usr/bin/env node
/**
 * mss-protoc-gen
 *
 * proto メッセージの `@entity` マーカーから DDD の Entity / Repository interface /
 * Mock / Postgres (Drizzle ORM) 実装 / DTO を生成する。加えて proto service/rpc から
 * Usecase interface / Hono REST Handler / handler-registry を生成する。
 *
 * テンプレートは `generator/<kind>/output/<ターゲットパス>/<name>.tpl` に格納。
 *
 * 解釈アノテーション:
 *   @entity     メッセージに付与。Entity / Repository / Mock / Postgres / DTO の 5 ファイル生成
 *   @pk         フィールド: 主キー
 *   @unique     フィールド: ユニーク。selectBy<Field> を追加生成
 *   @email      フィールド: email バリデーション
 *   @required   フィールド: 非空バリデーション
 *   @timestamp  int64 フィールド: TS では Date にマップ。末尾 "Unix" を除去
 *   @paging     フィールド: cursor pagination の cursor 列。selectByCursor を追加生成。@pk か @unique 必須、型は string/int32/int64
 *   @http METHOD /path  rpc に付与: REST URL を宣言
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
  {
    name: "dto",
    tplPath: "generator/dto/output/src/dto/dto.gen.ts.tpl",
    outPath: (kebab) => `src/dto/${kebab}.gen.ts`,
  },
];

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
  version: "v0.5.0",
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
    for (const file of schema.files) {
      for (const service of file.services) {
        const svc = buildServiceData(service, entitiesByFullName);
        allServices.push(svc);
        for (const kind of SERVICE_KINDS) {
          const rendered = render(templates[kind.name], svc, funcs);
          const f = schema.generateFile(kind.outPath(svc.Kebab));
          f.print(rendered.trimEnd());
        }
      }
    }

    if (allServices.length > 0) {
      allServices.sort((a, b) => a.ServiceName.localeCompare(b.ServiceName));
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

// `// @http METHOD /path` を抽出。Hono の `:name` 形式 (HonoPath) も同梱。
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
      const isBodyMethod = ["POST", "PUT", "PATCH"].includes(method);
      const isQueryMethod = ["GET", "DELETE"].includes(method);
      return {
        Method: method,
        MethodLower: method.toLowerCase(),
        Path: urlPath,
        HonoPath: honoPath,
        PathParams: pathParams,
        IsBodyMethod: isBodyMethod,
        IsQueryMethod: isQueryMethod,
      };
    }
  }
  return null;
}

function scalarTsType(field) {
  switch (field.scalar) {
    case 9:
      return "string";
    case 5:
    case 3:
    case 13:
    case 4:
      return "number";
    case 8:
      return "boolean";
    default:
      return "string";
  }
}

// queryScalarType は GET/DELETE で query string から取得する scalar 型を返す。
// 配列 / message は対応外なので null。
function queryScalarType(field) {
  if (field.repeated || field.message) return null;
  return scalarTsType(field);
}

// body / repeated / non-scalar フィールドが未指定だった場合に使う default 式を返す。
// テンプレート側で type 別の if / else を書かずに済むように、生成側で確定させる。
function defaultValueExpr(field) {
  if (field.repeated) return "[]";
  if (field.message) return "undefined as never";
  switch (scalarTsType(field)) {
    case "string":
      return '""';
    case "number":
      return "0";
    case "boolean":
      return "false";
    default:
      return '""';
  }
}

// body フィールドを受け取って `body.<jsonName> ?? <default>` 相当のキャストを返す。
// repeated / message はキャストが必要になるので AS で型を補完する。
function bodyParseExpr(field, queryName = "body") {
  const access = `${queryName}.${field.name}`;
  if (field.repeated || field.message) {
    return `(${access} ?? ${defaultValueExpr(field)}) as ${typeOfField(field)}`;
  }
  return `${access} ?? ${defaultValueExpr(field)}`;
}

// query string から scalar を読む式を返す。
function queryParseExpr(field) {
  switch (queryScalarType(field)) {
    case "string":
      return `c.req.query("${field.name}") ?? ""`;
    case "number":
      return `Number(c.req.query("${field.name}") ?? "0")`;
    case "boolean":
      return `c.req.query("${field.name}") === "true"`;
    default:
      return `c.req.query("${field.name}") ?? ""`;
  }
}

function typeOfField(field) {
  // resolveFieldType を呼ばず scalar / fallback のみ判定 — body cast 用途なので
  // 実用上はテンプレート展開後の型注釈と一致する保証が要る箇所では使わない。
  if (field.repeated) return "unknown[]";
  if (field.message) return "unknown";
  return scalarTsType(field);
}

function parseEntity(message) {
  const leading = message.getComments().leading ?? "";
  if (!hasMarker(leading, "@entity")) return null;

  const fields = [];
  let pkField = null;
  let pagingField = null;
  const uniqueFieldsNonPK = [];

  for (const field of message.fields) {
    const comment = field.getComments().leading ?? "";
    const isPk = hasMarker(comment, "@pk");
    const isUnique = hasMarker(comment, "@unique");
    const isEmail = hasMarker(comment, "@email");
    const isRequired = hasMarker(comment, "@required");
    const isTimestamp = hasMarker(comment, "@timestamp");
    const isPaging = hasMarker(comment, "@paging");

    let type = "string";
    let name = localName(field);
    const pbName = name;

    if (isTimestamp) {
      type = "Date";
      name = name.replace(/Unix$/, "");
    } else {
      type = scalarTsType(field);
    }

    const snakeName = camelToSnake(name);
    const spec = {
      name,
      pbName,
      snakeName,
      type,
      isPk,
      isUnique,
      isEmail,
      isRequired,
      isTimestamp,
      isPaging,
    };
    fields.push(spec);
    if (isPk) pkField = spec;
    if (isUnique && !isPk) uniqueFieldsNonPK.push(spec);
    if (isPaging) {
      if (pagingField) {
        throw new Error(
          `entity ${message.name}: only one @paging field is allowed, found multiple`,
        );
      }
      if (!isPk && !isUnique) {
        throw new Error(
          `entity ${message.name}: @paging field "${name}" must also have @pk or @unique`,
        );
      }
      if (type !== "string" && type !== "number") {
        throw new Error(
          `entity ${message.name}: @paging field "${name}" must be string/int32/int64 (got ${type})`,
        );
      }
      pagingField = spec;
    }
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
    PagingField: pagingField,
    HasPaging: pagingField != null,
  };
}

// 非 entity message の TS 表現を作る。同じ message を複数回参照した場合は同じ struct を再利用する。
// reservedNames には rpc 由来の <Method>Input / Output が入っており、衝突したら "_" を付け足してリネーム。
function resolveNonEntityType(message, entitiesByFullName, nonEntityByFullName, reservedNames) {
  if (entitiesByFullName.has(message.typeName)) {
    // entity は別レイヤーで生成済み
    return entitiesByFullName.get(message.typeName).Name;
  }
  if (nonEntityByFullName.has(message.typeName)) {
    return nonEntityByFullName.get(message.typeName).Name;
  }
  let candidate = message.name;
  while (reservedNames.has(candidate) || isNameUsedAsNonEntity(candidate, nonEntityByFullName)) {
    candidate += "_";
  }
  // フィールド型を解決(再帰、ただし scalar / entity 参照のみ — 非 entity の入れ子は別途登録)
  const fields = message.fields.map((f) => {
    const type = resolveFieldType(f, entitiesByFullName, nonEntityByFullName, reservedNames);
    const nm = localName(f);
    return {
      name: nm,
      jsonName: f.name, // proto 上の field 名(snake_case)
      snakeName: camelToSnake(nm),
      type,
      isList: f.repeated,
    };
  });
  const entry = { Name: candidate, Fields: fields };
  nonEntityByFullName.set(message.typeName, entry);
  return candidate;
}

function isNameUsedAsNonEntity(name, nonEntityByFullName) {
  for (const v of nonEntityByFullName.values()) if (v.Name === name) return true;
  return false;
}

function resolveFieldType(field, entitiesByFullName, nonEntityByFullName, reservedNames) {
  const elemType = resolveElementType(field, entitiesByFullName, nonEntityByFullName, reservedNames);
  return field.repeated ? `${elemType}[]` : elemType;
}

function resolveElementType(field, entitiesByFullName, nonEntityByFullName, reservedNames) {
  if (field.message) {
    return resolveNonEntityType(field.message, entitiesByFullName, nonEntityByFullName, reservedNames);
  }
  return scalarTsType(field);
}

function buildServiceData(service, entitiesByFullName) {
  const serviceName = service.name;
  const kebab = pascalToKebab(serviceName.replace(/Service$/, ""));
  const baseName = serviceName.replace(/Service$/, "");
  const handlerClassName = `${baseName}RestHandler`;

  // rpc 由来で予約される型名(<Method>Input / <Method>Output) を集める
  const reservedNames = new Set();
  for (const method of service.methods) {
    reservedNames.add(`${method.name}Input`);
    reservedNames.add(`${method.name}Output`);
  }

  // 非 entity message を service スコープで集約。重複は同一 struct を再利用。
  const nonEntityByFullName = new Map();

  const methods = [];
  const usedEntitiesByName = new Map();
  let anyReturnsEntity = false;
  let anyHasBody = false;
  let anyHasQuery = false;

  for (const method of service.methods) {
    const http = parseHttpAnnotation(method.getComments().leading ?? "");
    const m = {
      rpcName: method.name,
      lowerName: lowerFirst(method.name),
      InputTypeName: `${method.name}Input`,
      InputFields: [],
      BodyFields: [],
      QueryFields: [],
      PathParamFields: [],
      HasInputFields: method.input.fields.length > 0,
      HasBodyFields: false,
      HasQueryFields: false,
      HasPathParams: false,
      EntityName: "",
      EntityLowerFirst: "",
      EntityKebab: "",
      ReturnsEntity: false,
      ReturnsList: false,
      ReturnsEmpty: false,
      Http: http,
      IsBodyMethod: http?.IsBodyMethod ?? false,
      IsQueryMethod: http?.IsQueryMethod ?? false,
    };

    const pathParamNames = http ? http.PathParams : [];

    for (const field of method.input.fields) {
      const fieldName = localName(field);
      const tsType = resolveFieldType(field, entitiesByFullName, nonEntityByFullName, reservedNames);
      const isPath = pathParamNames.includes(fieldName) || pathParamNames.includes(field.name);
      const isQuery = !isPath && m.IsQueryMethod;
      const isBody = !isPath && !isQuery;
      let assignExpr;
      if (isPath) {
        assignExpr = `c.req.param("${field.name}") ?? ""`;
      } else if (isQuery) {
        assignExpr = queryParseExpr(field);
      } else {
        // body
        if (field.repeated || field.message) {
          assignExpr = `(body.${field.name} ?? ${defaultValueExpr(field)}) as ${tsType}`;
        } else {
          assignExpr = `body.${field.name} ?? ${defaultValueExpr(field)}`;
        }
      }
      const inputField = {
        name: fieldName,
        jsonName: field.name,
        snakeName: camelToSnake(fieldName),
        type: tsType,
        isList: field.repeated,
        queryScalarType: queryScalarType(field),
        assignExpr,
      };
      m.InputFields.push(inputField);
      if (isPath) m.PathParamFields.push(inputField);
      else if (isQuery) m.QueryFields.push(inputField);
      else m.BodyFields.push(inputField);
    }
    m.HasBodyFields = m.BodyFields.length > 0;
    m.HasQueryFields = m.QueryFields.length > 0;
    m.HasPathParams = m.PathParamFields.length > 0;
    if (m.HasBodyFields) anyHasBody = true;
    if (m.HasQueryFields) anyHasQuery = true;

    // Response 形状判定: 単一フィールドが @entity メッセージならマップ
    if (method.output.fields.length === 1) {
      const resField = method.output.fields[0];
      if (resField.message && entitiesByFullName.has(resField.message.typeName)) {
        const ent = entitiesByFullName.get(resField.message.typeName);
        m.EntityName = ent.Name;
        m.EntityLowerFirst = ent.LowerFirst;
        m.EntityKebab = ent.Kebab;
        m.ResponseField = localName(resField);
        if (resField.repeated) m.ReturnsList = true;
        else m.ReturnsEntity = true;
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
    if (!m.ReturnsEntity && !m.ReturnsList) m.ReturnsEmpty = true;
    if (m.ReturnsEntity || m.ReturnsList) anyReturnsEntity = true;

    methods.push(m);
  }

  const usedEntities = Array.from(usedEntitiesByName.values()).sort((a, b) =>
    a.Name.localeCompare(b.Name),
  );
  const nonEntityTypes = Array.from(nonEntityByFullName.values()).sort((a, b) =>
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
    NonEntityTypes: nonEntityTypes,
    AnyReturnsEntity: anyReturnsEntity,
    AnyHasBody: anyHasBody,
    AnyHasQuery: anyHasQuery,
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
