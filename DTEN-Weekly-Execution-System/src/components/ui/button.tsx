import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type ButtonTone = "primary" | "secondary" | "ghost";

const toneClass: Record<ButtonTone, string> = {
  primary: "button button-primary",
  secondary: "button button-secondary",
  ghost: "button button-ghost",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
};

export function Button({ className = "", tone = "primary", ...props }: ButtonProps) {
  return <button className={`${toneClass[tone]} ${className}`.trim()} {...props} />;
}

type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
  tone?: ButtonTone;
};

export function LinkButton({ className = "", href, tone = "primary", ...props }: LinkButtonProps) {
  return <Link className={`${toneClass[tone]} ${className}`.trim()} href={href} {...props} />;
}
