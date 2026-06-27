import { cn } from "@/lib/utils";

export function AvatarFrame({
  className,
  image,
  initial,
  imageClassName,
}: {
  className?: string;
  image: string;
  imageClassName?: string;
  initial: string;
}) {
  if (image) {
    return (
      <span
        className={cn("shrink-0 overflow-hidden rounded-full", className)}
        aria-hidden="true"
      >
        <span
          className={cn(
            "block size-full scale-[1.12] bg-cover bg-center",
            imageClassName,
          )}
          style={{ backgroundImage: `url(${JSON.stringify(image)})` }}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        className,
      )}
    >
      {initial}
    </span>
  );
}
