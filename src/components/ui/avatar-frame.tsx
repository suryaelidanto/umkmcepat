import { cn } from "@/lib/utils";

export function AvatarFrame({
  className,
  seed,
  imageClassName,
}: {
  className?: string;
  seed: string;
  imageClassName?: string;
}) {
  const url = `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(seed.trim() || "default")}`;

  return (
    <span
      className={cn("shrink-0 overflow-hidden rounded-full", className)}
      aria-hidden="true"
    >
      <img
        src={url}
        alt={seed}
        className={cn("size-full object-cover", imageClassName)}
      />
    </span>
  );
}
