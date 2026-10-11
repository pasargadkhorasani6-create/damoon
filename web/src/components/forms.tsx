"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn-primary w-full" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "لطفاً صبر کنید…" : children}
    </button>
  );
}

export function FormMessage({ error, message }: { error?: string; message?: string }) {
  if (error)
    return (
      <p role="alert" className="rounded-lg border border-down/40 bg-down/10 p-3 text-sm text-down">
        {error}
      </p>
    );
  if (message) return <p className="rounded-lg border border-up/40 bg-up/10 p-3 text-sm text-up">{message}</p>;
  return null;
}

export function Field({
  label,
  name,
  type = "text",
  dir,
  ...rest
}: { label: string; name: string; type?: string; dir?: "ltr" | "rtl" } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input name={name} type={type} dir={dir} className="input" {...rest} />
    </label>
  );
}
