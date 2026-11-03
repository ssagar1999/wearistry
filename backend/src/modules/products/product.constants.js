// The marketplace serves India only. These lists drive validation and filters; the web app shows the same.
// Location = state + city. Buyers mostly want clothes from their own state (no long shipping), so every
// listing carries its state, derived from the city on the server (never trusted from the client).
// City names are unique across states. The web app keeps the same list in src/lib/data.ts.
export const LOCATIONS = /** @type {const} */ ({
  "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Tirupati"],
  Assam: ["Guwahati"],
  Bihar: ["Patna"],
  Chandigarh: ["Chandigarh"],
  Chhattisgarh: ["Raipur"],
  Delhi: ["Delhi", "New Delhi"],
  Goa: ["Panaji"],
  Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Rajkot"],
  Haryana: ["Gurugram", "Faridabad"],
  "Himachal Pradesh": ["Shimla"],
  Jharkhand: ["Ranchi"],
  Karnataka: ["Bengaluru", "Mysuru", "Mangaluru"],
  Kerala: ["Kochi", "Thiruvananthapuram", "Kozhikode"],
  "Madhya Pradesh": ["Indore", "Bhopal"],
  Maharashtra: ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane"],
  Odisha: ["Bhubaneswar"],
  Punjab: ["Ludhiana", "Amritsar"],
  Rajasthan: ["Jaipur", "Jodhpur", "Udaipur"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai"],
  Telangana: ["Hyderabad"],
  "Uttar Pradesh": ["Lucknow", "Noida", "Kanpur", "Varanasi"],
  Uttarakhand: ["Dehradun"],
  "West Bengal": ["Kolkata"],
});
export const STATES = /** @type {(keyof typeof LOCATIONS)[]} */ (Object.keys(LOCATIONS));
export const CITIES = /** @type {string[]} */ (Object.values(LOCATIONS).flat());

/**
 * @param {string} city
 * @returns {string} the state the city is in, or "" for a city we don't list
 */
export function stateOfCity(city) {
  return STATES.find((state) => /** @type {readonly string[]} */ (LOCATIONS[state]).includes(city)) ?? "";
}
export const CATEGORIES = /** @type {const} */ ([
  "Jackets",
  "Shirts",
  "Sarees",
  "Dupattas",
  "Denim",
  "Tops",
  "Skirts",
  "Accessories",
]);
export const SIZES = /** @type {const} */ (["XS", "S", "M", "L", "XL", "Free size"]);
export const CONDITIONS = /** @type {const} */ (["Like new", "Excellent", "Good"]);
export const MAX_PHOTOS = 8;
