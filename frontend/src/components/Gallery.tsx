"use client";
import { useRef, useState } from "react";
import Photo from "./Photo";

/** Swipeable on phones, with thumbnails on larger screens. The first photo loads eagerly, the rest lazily. */
export default function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const go = (n: number) => track.current?.scrollTo({ left: n * track.current.clientWidth, behavior: "smooth" });

  return (
    <div>
      <div className="relative">
        <div ref={track} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          className="flex snap-x snap-mandatory overflow-x-auto rounded [scrollbar-width:none]">
          {images.map((src, n) => (
            <div key={src} className="aspect-[4/5] w-full shrink-0 snap-center overflow-hidden bg-beige">
              <Photo src={src} alt={`${alt}, photo ${n + 1}`} sizes="(min-width: 768px) 50vw, 100vw" priority={n === 0} />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-semibold text-canvas">{i + 1} / {images.length}</span>
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-2 hidden gap-2 md:flex">
          {images.map((src, n) => (
            <button key={src} onClick={() => go(n)} aria-label={`Show photo ${n + 1}`}
              className={`h-20 w-16 overflow-hidden rounded ${n === i ? "ring-2 ring-ink" : "opacity-70"}`}>
              <Photo src={src} alt="" sizes="64px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
