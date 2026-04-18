import type { ReactNode } from "react";

export default function AuthInput(props: {
  icon?: ReactNode;
  rightIcon?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  error?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm ${
        props.error ? "border-red-400" : "border-zinc-200"
      }`}
    >
      {props.icon && <div className="text-zinc-400">{props.icon}</div>}

      <input
        className="
          flex-1
          bg-transparent
          text-base
          outline-none
          placeholder:text-zinc-400
          [transform:scale(0.875)]
          origin-left
        "
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        type={props.type ?? "text"}
      />

      {props.rightIcon && (
        <div className="text-zinc-400 flex items-center">
          {props.rightIcon}
        </div>
      )}
    </div>
  );
}