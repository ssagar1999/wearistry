/* eslint-disable @next/next/no-img-element */
import { isSamplePhoto, photoSrcSet, photoUrl } from "@/lib/photo";

type Props = { src: string; alt: string; sizes: string; className?: string; priority?: boolean };

export default function Photo({ src, alt, sizes, className = "", priority }: Props) {
  return (
    <img
      src={photoUrl(src, 960)}
      srcSet={photoSrcSet(src)}
      sizes={sizes}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      // Scaling from the bottom hides the caption strip baked into the sample photos.
      className={`h-full w-full object-cover ${isSamplePhoto(src) ? "origin-bottom scale-110" : ""} ${className}`}
    />
  );
}
