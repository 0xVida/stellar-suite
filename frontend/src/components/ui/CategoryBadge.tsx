interface CategoryBadgeProps {
  children: React.ReactNode;
  variant?: "default" | "cyan" | "blue";
  onClick?: () => void;
}

export function CategoryBadge({
  children,
  variant = "default",
  onClick,
}: CategoryBadgeProps) {
  const colors = {
    default:
      "bg-slate-gray/60 text-muted-silver border-border-subtle",
    cyan: "bg-electric-cyan/10 text-electric-cyan border-electric-cyan/20",
    blue: "bg-stellar-blue/10 text-stellar-blue border-stellar-blue/20",
  };

  return (
    <span
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className={`inline-flex items-center rounded-[var(--radius)] border px-2 py-0.5 text-xs font-medium ${colors[variant]} ${
        onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""
      }`}
    >
      {children}
    </span>
  );
}
