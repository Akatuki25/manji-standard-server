"""mss-protoc-gen (Python port) — proto → 注釈付きモデル。

Go 版 (cmd/mss-protoc-gen) が protoreflect でやることの Python 版:
protoc で FileDescriptorSet(source info 付き)を出し、リーディングコメントから
`@entity @pk @paging @unique @email @required @timestamp @http ...` を抽出する。
buf 非依存(protoc のみ)。標準ライブラリ + protobuf のみ。
"""
from __future__ import annotations
import subprocess
import tempfile
import os
import re
from dataclasses import dataclass, field as dc_field
from google.protobuf import descriptor_pb2 as dpb

# FileDescriptorProto のフィールド番号(source_code_info.location.path 用)
_MSG, _MSG_FIELD, _SVC, _SVC_METHOD = 4, 2, 6, 2

_TYPE = {
    dpb.FieldDescriptorProto.TYPE_STRING: "string",
    dpb.FieldDescriptorProto.TYPE_INT64: "int64",
    dpb.FieldDescriptorProto.TYPE_INT32: "int32",
    dpb.FieldDescriptorProto.TYPE_BOOL: "bool",
    dpb.FieldDescriptorProto.TYPE_DOUBLE: "double",
    dpb.FieldDescriptorProto.TYPE_MESSAGE: "message",
    dpb.FieldDescriptorProto.TYPE_ENUM: "enum",
}
_ANNO = re.compile(r"@(\w+)(?:\s+([^\n@]+))?")


def _annos(comment: str | None) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in _ANNO.finditer(comment or ""):
        out[m.group(1)] = (m.group(2) or "").strip()
    return out


_PY = {"string": "str", "int64": "int", "int32": "int", "bool": "bool", "double": "float"}
_SQL = {"string": "String", "int64": "BigInteger", "int32": "Integer",
        "bool": "Boolean", "double": "Float"}


@dataclass
class Field:
    name: str
    type: str          # string/int64/... or message name
    repeated: bool
    annotations: dict[str, str]

    @property
    def is_timestamp(self) -> bool:
        return "timestamp" in self.annotations

    @property
    def is_pk(self) -> bool:
        return "pk" in self.annotations

    @property
    def entity_attr(self) -> str:
        """Entity 属性名。@timestamp の `*_unix` は `*`(native datetime)にする。"""
        if self.is_timestamp and self.name.endswith("_unix"):
            return self.name[: -len("_unix")]
        return self.name

    @property
    def py_type(self) -> str:
        """Entity 側 Python 型。"""
        if self.is_timestamp:
            return "datetime"
        return _PY.get(self.type, "str")

    @property
    def sql_type(self) -> str:
        if self.is_timestamp:
            return "DateTime(timezone=True)"
        return _SQL.get(self.type, "String") + ("(255)" if self.type == "string" else "")

    @property
    def dto_type(self) -> str:
        """DTO 側の型。@timestamp は unix(int)のまま。"""
        return _PY.get(self.type, "str")

    @property
    def nullable(self) -> bool:
        return not (self.is_pk or "required" in self.annotations)


@dataclass
class Message:
    name: str
    fields: list[Field]
    annotations: dict[str, str]

    @property
    def is_entity(self) -> bool:
        return "entity" in self.annotations

    @property
    def table(self) -> str:
        v = self.annotations.get("entity", "")
        m = re.search(r"table=(\S+)", v)
        return m.group(1) if m else _snake(self.name) + "s"

    def pk(self) -> Field | None:
        return next((f for f in self.fields if "pk" in f.annotations), None)

    @property
    def unique_fields(self) -> list[Field]:
        """@unique な非PKフィールド(SelectBy<Field> を生む)。"""
        return [f for f in self.fields if "unique" in f.annotations and not f.is_pk]

    @property
    def paging_field(self) -> "Field | None":
        return next((f for f in self.fields if "paging" in f.annotations), None)


@dataclass
class Rpc:
    name: str
    input: str
    output: str
    http_method: str
    http_path: str
    path_params: list[str]
    # enrich() で後付け
    input_fields: list["Field"] = dc_field(default_factory=list)
    path_fields: list["Field"] = dc_field(default_factory=list)
    query_fields: list["Field"] = dc_field(default_factory=list)
    body_fields: list["Field"] = dc_field(default_factory=list)
    ret_kind: str = "output"      # dto | list | empty | output
    ret_entity: str = ""          # entity 名(dto/list のとき)

    @property
    def is_body_method(self) -> bool:
        return self.http_method in ("POST", "PUT", "PATCH")

    @property
    def has_msg_input(self) -> bool:
        """入力にメッセージ型フィールド(ネストparam)を含むか。含むものは初回生成では除外。"""
        return any(f.type[:1].isupper() for f in self.input_fields)


@dataclass
class Service:
    name: str
    rpcs: list[Rpc]


@dataclass
class ProtoModel:
    package: str
    messages: list[Message]
    services: list[Service]

    def message(self, name: str) -> Message | None:
        return next((m for m in self.messages if m.name == name), None)


def _snake(s: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", s).lower()


def _short(type_name: str) -> str:
    return type_name.rsplit(".", 1)[-1]


def build_descriptor(proto_rel: str, proto_root: str) -> dpb.FileDescriptorProto:
    with tempfile.NamedTemporaryFile(suffix=".binpb", delete=False) as tf:
        out = tf.name
    try:
        subprocess.run(
            ["protoc", "-I.", "--include_source_info",
             f"--descriptor_set_out={out}", proto_rel],
            check=True, cwd=proto_root,
        )
        fds = dpb.FileDescriptorSet()
        with open(out, "rb") as f:
            fds.ParseFromString(f.read())
        return fds.file[0]
    finally:
        if os.path.exists(out):
            os.unlink(out)


def parse(proto_rel: str, proto_root: str) -> ProtoModel:
    fp = build_descriptor(proto_rel, proto_root)
    loc = {tuple(li.path): li.leading_comments for li in fp.source_code_info.location}

    messages: list[Message] = []
    for mi, m in enumerate(fp.message_type):
        msg_anno = _annos(loc.get((_MSG, mi)))
        fields: list[Field] = []
        for fi, f in enumerate(m.field):
            fa = _annos(loc.get((_MSG, mi, _MSG_FIELD, fi)))
            t = _short(f.type_name) if f.type in (dpb.FieldDescriptorProto.TYPE_MESSAGE,
                                                  dpb.FieldDescriptorProto.TYPE_ENUM) else _TYPE.get(f.type, "string")
            repeated = f.label == dpb.FieldDescriptorProto.LABEL_REPEATED
            fields.append(Field(f.name, t, repeated, fa))
        messages.append(Message(m.name, fields, msg_anno))

    services: list[Service] = []
    for si, s in enumerate(fp.service):
        rpcs: list[Rpc] = []
        for mi, meth in enumerate(s.method):
            ma = _annos(loc.get((_SVC, si, _SVC_METHOD, mi)))
            http = ma.get("http", "")
            parts = http.split(None, 1)
            method = parts[0] if parts else "POST"
            path = parts[1] if len(parts) > 1 else "/"
            params = re.findall(r"\{(\w+)\}", path)
            rpcs.append(Rpc(meth.name, _short(meth.input_type), _short(meth.output_type),
                            method, path, params))
        services.append(Service(s.name, rpcs))

    pm = ProtoModel(fp.package, messages, services)
    _enrich(pm)
    return pm


def _enrich(pm: "ProtoModel") -> None:
    """rpc に入力フィールドの bucket(path/query/body)と返却種別を後付けする。"""
    entity_names = {m.name for m in pm.messages if m.is_entity}
    for svc in pm.services:
        for rpc in svc.rpcs:
            req = pm.message(rpc.input)
            fields = list(req.fields) if req else []
            rpc.input_fields = fields
            for f in fields:
                if f.name in rpc.path_params:
                    rpc.path_fields.append(f)
                elif rpc.is_body_method:
                    rpc.body_fields.append(f)
                else:  # GET/DELETE の非パス → query(scalar のみ)
                    if f.type in ("string", "int32", "int64", "bool") and not f.repeated:
                        rpc.query_fields.append(f)
            # 返却種別: response の単一フィールドが entity か
            resp = pm.message(rpc.output)
            rf = list(resp.fields) if resp else []
            if not rf:
                rpc.ret_kind = "empty"
            elif len(rf) == 1 and rf[0].type in entity_names:
                rpc.ret_entity = rf[0].type
                rpc.ret_kind = "list" if rf[0].repeated else "dto"
            else:
                rpc.ret_kind = "output"


if __name__ == "__main__":
    import sys
    root = sys.argv[1] if len(sys.argv) > 1 else "proto"
    rel = sys.argv[2] if len(sys.argv) > 2 else "user/v1/user.proto"
    pm = parse(rel, root)
    print("package:", pm.package)
    for m in pm.messages:
        if m.is_entity:
            print(f"[entity] {m.name} table={m.table} pk={m.pk().name if m.pk() else None}")
            for f in m.fields:
                print(f"    {f.name}: {f.type}{' []' if f.repeated else ''}  {f.annotations}")
    for s in pm.services:
        print(f"[service] {s.name}")
        for r in s.rpcs:
            print(f"    {r.name}: {r.http_method} {r.http_path} params={r.path_params} ({r.input}->{r.output})")
