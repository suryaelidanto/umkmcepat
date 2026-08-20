import type { ImgHTMLAttributes } from "react";

// Compatibility wrapper for the previous next/image usage. Generated apps and
export type ImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "height" | "width"
> & {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  priority?: boolean;
  fill?: boolean;
  unoptimized?: boolean;
};

export function Image({
  src,
  alt,
  width,
  height,
  priority,
  fill,
  unoptimized: _unoptimized,
  style,
  ...props
}: ImageProps) {
  const fillStyle = fill
    ? {
        position: "absolute" as const,
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover" as const,
      }
    : undefined;

  return (
    <img
      src={src}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      style={fillStyle ? { ...fillStyle, ...style } : style}
      {...props}
    />
  );
}
