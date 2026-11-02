import { isDatabaseConnected } from "../../config/database.js";

/** The process is up and able to answer. Used by orchestrators to decide whether to restart it. */
export function getLiveness() {
  return { status: "ok", uptimeSeconds: Math.round(process.uptime()) };
}

/**
 * Whether this instance can serve real traffic. Load balancers should only route requests here while
 * this is ready; a lost database connection makes the instance "unavailable" without killing it.
 */
export function getReadiness() {
  const database = isDatabaseConnected() ? "up" : "down";
  return {
    ready: database === "up",
    body: { status: database === "up" ? "ok" : "unavailable", checks: { database } },
  };
}
