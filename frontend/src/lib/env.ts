// Local/dev behaviour: login codes are shown on screen instead of sent by SMS, and photos are stored on disk.
// On in `npm run dev`. In a production build (e.g. Docker) only when DEV_MODE=true. Never enable it on the live site.
export const devMode = () => process.env.NODE_ENV !== "production" || process.env.DEV_MODE === "true";
