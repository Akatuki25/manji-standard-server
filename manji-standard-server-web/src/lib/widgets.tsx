// 手書き: componentMap(widget 実体)。生成フォームはこれに委譲する。
// 見た目/テーマはここで持つ = 生成/手書きの境界(構造は生成、widget は手書き)。
import type { ReactElement } from "react";

export function Field({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
}): ReactElement {
  const readOnly = type === "readonly";
  const inputType = type === "email" ? "email" : "text";
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 13, color: "#333" }}>{label}</span>
      {type === "textarea" ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} readOnly={readOnly} />
      ) : (
        <input type={inputType} value={value} onChange={(e) => onChange(e.target.value)} readOnly={readOnly} />
      )}
    </label>
  );
}
