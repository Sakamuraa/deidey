import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "quiet" | "link";
type Size = "md" | "lg" | "icon";

const BASE =
  "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap " +
  "rounded-btn transition-[background-color,border-color,color,transform,box-shadow] " +
  "duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:translate-y-[1px] " +
  "disabled:pointer-events-none disabled:opacity-55";

/**
 * `primary` is the cocoa fill. Chosen over a peach fill because the brand's own
 * peach (#DCA08A) only reaches 3.5:1 against the ink, which fails as a button
 * background. Cocoa on peach is 6.4:1.
 */
const VARIANTS: Record<Variant, string> = {
  primary: "bg-cocoa text-bg hover:bg-milk hover:text-bg",
  // Transparent with a real 1px stroke. The stroke is load-bearing: without it
  // the button disappears into the page.
  quiet: "border border-line-strong text-fg hover:bg-surface hover:border-milk",
  link: "text-fg underline decoration-line-strong decoration-2 underline-offset-[6px] hover:decoration-milk rounded-none",
};

const SIZES: Record<Size, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
  /**
   * Square icon-only button. Exists as a first-class size on purpose.
   *
   * The previous version passed `className="size-10 px-0"` to override the
   * padding of `md`. That does not work: `px-0` and `px-5` have identical
   * specificity, so the winner is whichever Tailwind emits later in the
   * stylesheet, not whichever appears later in the class attribute. The
   * padding stayed at 20px, the content box collapsed to 0, and every icon
   * inside the button shrank to zero width and rendered as an empty box.
   */
  icon: "size-11 shrink-0 p-0",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

type ActionLinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & {
    href: string;
    /** Opens in a new tab with a safe rel. Use for outbound channel links. */
    external?: boolean;
  };

type ActionButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

function classesFor(variant: Variant, size: Size, extra: string | undefined) {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}${extra ? ` ${extra}` : ""}`;
}

/**
 * One implementation for anchors and buttons, so padding, radius, and focus
 * treatment cannot drift between the hero CTA and a footer link.
 */
export function ActionLink({
  variant = "primary",
  size = "md",
  className,
  href,
  external,
  children,
  ...rest
}: ActionLinkProps) {
  return (
    <a
      href={href}
      className={classesFor(variant, size, className)}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
    >
      {children}
    </a>
  );
}

export function ActionButton({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: ActionButtonProps) {
  return (
    <button type={type} className={classesFor(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}