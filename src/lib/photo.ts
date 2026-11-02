// Turns a stored photo URL into a URL for a given width. Shared by server and client components.
// Our photos are stored as "<base>/<uuid>" with files "<uuid>-480.webp", "-960.webp" and "-1600.webp",
// whether the base is local (/api/img) or S3/CloudFront (https://…/photos).
const WIDTHS = [480, 960, 1600];
const OURS = /(^\/api\/img|\/photos)\/[0-9a-f-]{36}$/;

export const photoUrl = (src: string, w: number) => (OURS.test(src) ? `${src}-${w}.webp` : src);

export const photoSrcSet = (src: string) =>
  OURS.test(src) ? WIDTHS.map((w) => `${photoUrl(src, w)} ${w}w`).join(", ") : undefined;

/** The sample photos from the design export, which carry a caption strip along the top. */
export const isSamplePhoto = (src: string) => src.startsWith("https://lh3.googleusercontent.com/");
