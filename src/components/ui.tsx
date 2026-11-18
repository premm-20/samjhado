"use client";

export function IconBtn({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`press grid size-8 place-items-center rounded-lg text-white/60 transition-colors duration-150 hover:bg-white/[0.07] hover:text-white ${
        active ? "bg-white/[0.08] text-white" : ""
      }`}
    >
      {children}
    </button>
  );
}
