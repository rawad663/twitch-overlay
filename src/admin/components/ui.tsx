"use client";

import type { ReactNode } from "react";
import s from "../admin.module.css";

export function Section({
  title,
  children,
  disabled,
}: {
  title: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <section className={`${s.section} ${disabled ? s.disabled : ""}`}>
      <h2 className={s.sectionHead}>{title}</h2>
      {children}
    </section>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "ghost" | "warn" | "remove";
  size?: "sm" | "block";
};

export function Button({ variant = "solid", size = "sm", className = "", ...rest }: ButtonProps) {
  const variantClass =
    variant === "ghost"
      ? s.btnGhost
      : variant === "warn"
        ? s.btnWarn
        : variant === "remove"
          ? s.btnRm
          : "";
  const sizeClass = size === "block" ? s.btnBlock : s.btnSm;
  return <button type="button" className={`${s.btn} ${variantClass} ${sizeClass} ${className}`} {...rest} />;
}

export function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function NumberInput({
  id,
  value,
  onChange,
  min = 1,
  max,
  className = "",
  style,
}: {
  id: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <input
      id={id}
      type="number"
      className={`${s.input} ${className}`}
      style={style}
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => onChange(parseInt(e.target.value, 10))}
    />
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <div className={s.hint}>{children}</div>;
}
