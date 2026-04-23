// Minimal Go-text/template compatible renderer.
// Supports: {{ .path }}, {{ $.path }}, {{ .foo.bar }}, {{ if .x }}…{{ end }},
// {{ range .arr }}…{{ end }}, {{ funcName arg1 arg2 }}, {{- … }} / {{ … -}} trim,
// {{ and a b }}, {{ or a b }}, {{ not a }}, {{ eq a b }}.

export function render(template, data, funcs = {}) {
  const tokens = applyTrim(tokenize(template));
  const ast = parse(tokens);
  return renderNode(ast, data, data, funcs);
}

function tokenize(tmpl) {
  const out = [];
  let i = 0;
  while (i < tmpl.length) {
    const start = tmpl.indexOf("{{", i);
    if (start === -1) {
      if (i < tmpl.length) out.push({ type: "text", value: tmpl.slice(i) });
      break;
    }
    if (start > i) out.push({ type: "text", value: tmpl.slice(i, start) });
    const end = tmpl.indexOf("}}", start);
    if (end === -1) throw new Error("unclosed {{ in template");
    const raw = tmpl.slice(start + 2, end);
    const trimLeft = raw.startsWith("-");
    const trimRight = raw.endsWith("-");
    let expr = raw;
    if (trimLeft) expr = expr.slice(1);
    if (trimRight) expr = expr.slice(0, -1);
    out.push({ type: "action", expr: expr.trim(), trimLeft, trimRight });
    i = end + 2;
  }
  return out;
}

function applyTrim(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "action") continue;
    if (t.trimLeft && i > 0 && tokens[i - 1].type === "text") {
      tokens[i - 1].value = tokens[i - 1].value.replace(/[ \t]*\n?\s*$/, "");
    }
    if (t.trimRight && i + 1 < tokens.length && tokens[i + 1].type === "text") {
      tokens[i + 1].value = tokens[i + 1].value.replace(/^\s*/, "");
    }
  }
  return tokens;
}

function parse(tokens) {
  const root = { type: "seq", children: [] };
  const stack = [root];
  // ifStack mirrors stack; each entry on stack that's an "if" gets tracked for
  // else branch switching. Map index → { ifNode, branch: "then" | "else" }.
  const ifStates = new Map();
  for (const tok of tokens) {
    const top = () => stack[stack.length - 1];
    const pushChild = (child) => {
      const parent = top();
      const state = ifStates.get(stack.length - 1);
      if (state && state.branch === "else") {
        state.ifNode.elseChildren.push(child);
      } else {
        parent.children.push(child);
      }
    };
    if (tok.type === "text") {
      pushChild(tok);
      continue;
    }
    const expr = tok.expr;
    if (expr === "end") {
      ifStates.delete(stack.length - 1);
      stack.pop();
      continue;
    }
    if (expr === "else") {
      const state = ifStates.get(stack.length - 1);
      if (!state) throw new Error("{{ else }} outside of {{ if ... }}");
      state.branch = "else";
      continue;
    }
    if (expr.startsWith("range ")) {
      const node = { type: "range", target: expr.slice(6).trim(), children: [] };
      pushChild(node);
      stack.push(node);
      continue;
    }
    if (expr.startsWith("if ")) {
      const node = { type: "if", cond: expr.slice(3).trim(), children: [], elseChildren: [] };
      pushChild(node);
      stack.push(node);
      ifStates.set(stack.length - 1, { ifNode: node, branch: "then" });
      continue;
    }
    pushChild({ type: "expr", expr });
  }
  if (stack.length !== 1) throw new Error("unbalanced {{ end }} in template");
  return root;
}

function renderNode(node, ctx, root, funcs) {
  if (node.type === "text") return node.value;
  if (node.type === "seq") return node.children.map((c) => renderNode(c, ctx, root, funcs)).join("");
  if (node.type === "expr") {
    const v = evalExpr(node.expr, ctx, root, funcs);
    return v == null ? "" : String(v);
  }
  if (node.type === "if") {
    const branch = truthy(evalExpr(node.cond, ctx, root, funcs)) ? node.children : node.elseChildren;
    return branch.map((c) => renderNode(c, ctx, root, funcs)).join("");
  }
  if (node.type === "range") {
    const arr = evalExpr(node.target, ctx, root, funcs);
    if (!Array.isArray(arr) || arr.length === 0) return "";
    return arr.map((item) => node.children.map((c) => renderNode(c, item, root, funcs)).join("")).join("");
  }
  return "";
}

function truthy(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

const BUILTINS = {
  and: (...a) => a.every(truthy),
  or: (...a) => a.some(truthy),
  not: (a) => !truthy(a),
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
};

function evalExpr(expr, ctx, root, funcs) {
  const toks = tokenizeExpr(expr);
  if (toks.length === 0) return "";
  const state = { toks, pos: 0 };
  return parseCall(state, ctx, root, funcs);
}

function parseCall(state, ctx, root, funcs) {
  if (state.pos >= state.toks.length) return undefined;
  const first = state.toks[state.pos];
  const fn = BUILTINS[first] ?? funcs[first];
  if (typeof fn !== "function") {
    state.pos++;
    return evalValue(first, ctx, root);
  }
  state.pos++;
  const args = [];
  while (state.pos < state.toks.length && state.toks[state.pos] !== ")") {
    args.push(parseArg(state, ctx, root, funcs));
  }
  return fn(...args);
}

function parseArg(state, ctx, root, funcs) {
  const tok = state.toks[state.pos];
  if (tok === "(") {
    state.pos++;
    const val = parseCall(state, ctx, root, funcs);
    if (state.toks[state.pos] !== ")") throw new Error("expected )");
    state.pos++;
    return val;
  }
  state.pos++;
  return evalValue(tok, ctx, root);
}

function evalValue(tok, ctx, root) {
  if (tok.length === 0) return undefined;
  if (tok.startsWith('"') && tok.endsWith('"')) {
    return JSON.parse(tok);
  }
  if (tok === ".") return ctx;
  if (tok === "$") return root;
  if (tok.startsWith("$.")) return getPath(root, tok.slice(2));
  if (tok.startsWith(".")) return getPath(ctx, tok.slice(1));
  if (/^-?\d+(\.\d+)?$/.test(tok)) return Number(tok);
  if (tok === "true") return true;
  if (tok === "false") return false;
  return tok;
}

function getPath(obj, path) {
  if (!path) return obj;
  let v = obj;
  for (const p of path.split(".")) {
    if (v == null) return undefined;
    v = v[p];
  }
  return v;
}

function tokenizeExpr(expr) {
  const out = [];
  let i = 0;
  while (i < expr.length) {
    while (i < expr.length && /\s/.test(expr[i])) i++;
    if (i >= expr.length) break;
    const c = expr[i];
    if (c === "(" || c === ")") {
      out.push(c);
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < expr.length) {
        if (expr[j] === "\\") {
          j += 2;
          continue;
        }
        if (expr[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      out.push(expr.slice(i, j));
      i = j;
      continue;
    }
    let j = i;
    while (j < expr.length && !/\s/.test(expr[j]) && expr[j] !== "(" && expr[j] !== ")") j++;
    out.push(expr.slice(i, j));
    i = j;
  }
  return out;
}
