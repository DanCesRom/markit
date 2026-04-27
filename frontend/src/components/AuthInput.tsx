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
            className={`relative flex items-center rounded-2xl border bg-white px-4 py-3 shadow-sm ${props.error ? "border-red-400" : "border-zinc-200"
                }`}
        >
            {props.icon && (
                <div className="mr-3 text-zinc-400 shrink-0">
                    {props.icon}
                </div>
            )}

            <input
                className="
          flex-1
          min-w-0
          bg-transparent
          text-sm
          outline-none
          placeholder:text-zinc-400
          pr-10
        "
                placeholder={props.placeholder}
                value={props.value}
                onChange={(e) => props.onChange(e.target.value)}
                type={props.type ?? "text"}
            />

            {props.rightIcon && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400">
                    {props.rightIcon}
                </div>
            )}
        </div>
    );
}