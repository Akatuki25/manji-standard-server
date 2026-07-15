"""mss-protoc-gen (Python port) — レンダ駆動。

proto を parse し、Jinja2 テンプレで各 DDD レイヤの *.gen.py を出力する。
Go 版 cmd/mss-protoc-gen と同じ責務: 生成対象は entity/dto/repository/mock/
infra_repository/usecase_interface/handler/di/entity_registry。
usecase の *実装* と main は手書き(生成しない)。
使い方: python tools/mss-protoc-gen/main.py [proto相対パス]
  (省略時 user/v1/user.proto。新ドメインでは例: python tools/mss-protoc-gen/main.py atlas/v1/atlas.proto)
"""
from __future__ import annotations
import os
import sys
from jinja2 import Environment, FileSystemLoader, StrictUndefined

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))  # manji-standard-server-python/
sys.path.insert(0, HERE)
from parse import parse, ProtoModel, Message, _snake  # noqa: E402

TPL = os.path.join(HERE, "templates")


def _entity_of_service(pm: ProtoModel, svc) -> Message:
    # サービス名 <Name>Service の <Name> を entity 名とみなす(manji 規約)
    base = svc.name.removesuffix("Service")
    m = pm.message(base)
    if m and m.is_entity:
        return m
    # フォールバック: 最初の entity
    return next(m for m in pm.messages if m.is_entity)


# (template file, output path lambda(entity_snake))
# 生成マーカーはファイル名でなくヘッダコメント(# Code generated ... DO NOT EDIT.)で示す
# — Python はドット入りファイル名(user.gen.py)を import できないため。protobuf の *_pb2.py と同流儀。
GEN = [
    ("entity.py.jinja",             lambda s: f"app/domain/entity/{s}.py"),
    ("dto.py.jinja",                lambda s: f"app/dto/{s}.py"),
    ("repository.py.jinja",         lambda s: f"app/domain/repository/{s}_repository.py"),
    ("mock.py.jinja",               lambda s: f"app/domain/repository/mock/mock_{s}_repository.py"),
    ("infra_repository.py.jinja",   lambda s: f"app/infra/repository/{s}_postgres_repository.py"),
    ("usecase_interface.py.jinja",  lambda s: f"app/usecase/{s}_usecase_interface.py"),
    ("handler.py.jinja",            lambda s: f"app/handler/{s}_handler.py"),
]


def main() -> None:
    env = Environment(
        loader=FileSystemLoader(TPL),
        undefined=StrictUndefined,
        trim_blocks=True, lstrip_blocks=True, keep_trailing_newline=True,
    )
    env.filters["snake"] = _snake

    def _dtotype(f, entity_name: str) -> str:
        if f.type == entity_name:
            base = entity_name + "DTO"
        elif f.type[:1].isupper():  # 別メッセージ(CamelCase)
            base = f.type
        else:
            base = f.dto_type
        return f"list[{base}]" if f.repeated else base

    def _intype(f) -> str:
        """usecase Input / handler Body のフィールド型。message は param 名、scalar は python 型。"""
        base = f.type if f.type[:1].isupper() else f.dto_type
        return f"list[{base}]" if f.repeated else base

    env.filters["dtotype"] = _dtotype
    env.filters["intype"] = _intype

    # proto はスタック直下 proto/ からの相対パス。新ドメインの scaffold 利用時は引数で渡す(REUSE.md)。
    rel = sys.argv[1] if len(sys.argv) > 1 else "user/v1/user.proto"
    pm = parse(rel, os.path.join(ROOT, "proto"))

    for svc in pm.services:
        entity = _entity_of_service(pm, svc)
        s = _snake(entity.name)
        # param メッセージ(非entityで request の field 型に現れる CamelCase)を収集
        param_names: list[str] = []
        for r in svc.rpcs:
            for f in r.input_fields:
                if f.type[:1].isupper() and f.type != entity.name and f.type not in param_names:
                    param_names.append(f.type)
        params = [pm.message(n) for n in param_names]
        ctx = dict(pm=pm, service=svc, entity=entity, snake=s, rpcs=svc.rpcs,
                   params=params, msg=pm.message)
        for tpl_name, out_fn in GEN:
            rel = out_fn(s)
            dst = os.path.join(ROOT, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            content = env.get_template(tpl_name).render(**ctx)
            with open(dst, "w") as f:
                f.write(content)
            print("gen:", rel)

    # di registry (全 service 横断)
    di = env.get_template("di.py.jinja").render(pm=pm, services=pm.services, snake=_snake)
    os.makedirs(os.path.join(ROOT, "app/di"), exist_ok=True)
    with open(os.path.join(ROOT, "app/di/handlers.py"), "w") as f:
        f.write(di)
    print("gen: app/di/handlers.py")

    # entity registry
    reg = env.get_template("entity_registry.py.jinja").render(
        entities=[m for m in pm.messages if m.is_entity], snake=_snake)
    os.makedirs(os.path.join(ROOT, "app/domain/entity"), exist_ok=True)
    with open(os.path.join(ROOT, "app/domain/entity/registry.py"), "w") as f:
        f.write(reg)
    print("gen: app/domain/entity/registry.py")


if __name__ == "__main__":
    main()
