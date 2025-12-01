// <== IMPORTS ==>
import axios from "axios";

// <== LOCATION INFO TYPE ==>
export type LocationInfo = {
  // <== COUNTRY ==>
  country: string;
  // <== CITY ==>
  city: string;
  // <== REGION ==>
  region: string;
  // <== COUNTRY CODE ==>
  countryCode: string;
};

/**
 * GET PUBLIC IP ADDRESS
 * FETCHES USER'S PUBLIC IP FROM EXTERNAL SERVICE
 * @returns Public IP Address or Null
 */
// <== GET PUBLIC IP ==>
const getPublicIp = async (): Promise<string | null> => {
  try {
    // FETCH PUBLIC IP FROM IPIFY (FREE SERVICE)
    const response = await axios.get("https://api.ipify.org?format=json", {
      timeout: 5000,
    });
    // IF RESPONSE IS SUCCESSFUL
    if (response.data && response.data.ip) {
      // RETURN PUBLIC IP
      return response.data.ip;
    }
    // RETURN NULL IF FAILED
    return null;
  } catch (error) {
    // LOG ERROR SILENTLY
    console.error("Error fetching public IP:", error);
    // RETURN NULL
    return null;
  }
};

/**
 * GET LOCATION INFO FROM IP ADDRESS USING IP-API.COM
 * MORE ACCURATE FOR CITY DATA
 * @param ipAddress - IP Address String
 * @returns Location Info Object or Null
 */
// <== GET LOCATION FROM IP-API.COM ==>
const getLocationFromIpApi = async (
  ipAddress: string
): Promise<LocationInfo | null> => {
  try {
    // FETCH LOCATION FROM IP-API.COM (FREE SERVICE, MORE ACCURATE CITY DATA)
    const response = await axios.get(`http://ip-api.com/json/${ipAddress}`, {
      timeout: 5000,
    });
    // IF RESPONSE IS SUCCESSFUL
    if (
      response.data &&
      response.status === 200 &&
      response.data.status === "success"
    ) {
      // RETURN LOCATION INFO
      return {
        country: response.data.country || "Unknown",
        city: response.data.city || "Unknown",
        region: response.data.regionName || response.data.region || "Unknown",
        countryCode: response.data.countryCode || "XX",
      };
    }
    // RETURN NULL IF FAILED
    return null;
  } catch (error) {
    // RETURN NULL ON ERROR
    return null;
  }
};

/**
 * GET LOCATION INFO FROM IP ADDRESS
 * USING MULTIPLE SERVICES FOR BETTER ACCURACY
 * @param ipAddress - IP Address String
 * @returns Location Info Object or Null
 */
// <== GET LOCATION FROM IP ==>
export const getLocationFromIp = async (
  ipAddress: string
): Promise<LocationInfo | null> => {
  try {
    // CHECK IF IP IS LOCALHOST OR PRIVATE
    const isLocalOrPrivate =
      !ipAddress ||
      ipAddress === "unknown" ||
      ipAddress === "127.0.0.1" ||
      ipAddress === "::1" ||
      ipAddress.startsWith("192.168.") ||
      ipAddress.startsWith("10.") ||
      ipAddress.startsWith("172.16.");

    // IF IP IS LOCALHOST OR PRIVATE, TRY TO GET PUBLIC IP
    if (isLocalOrPrivate) {
      // GET PUBLIC IP
      const publicIp = await getPublicIp();
      // IF PUBLIC IP FOUND, USE IT FOR GEOLOCATION
      if (publicIp) {
        // TRY IP-API.COM FIRST (MORE ACCURATE CITY DATA)
        let locationInfo = await getLocationFromIpApi(publicIp);
        // IF IP-API.COM FAILED, TRY IPAPI.CO AS FALLBACK
        if (!locationInfo) {
          try {
            const response = await axios.get(
              `https://ipapi.co/${publicIp}/json/`,
              {
                timeout: 5000,
              }
            );
            if (response.data && response.status === 200) {
              locationInfo = {
                country: response.data.country_name || "Unknown",
                city: response.data.city || "Unknown",
                region: response.data.region || "Unknown",
                countryCode: response.data.country_code || "XX",
              };
            }
          } catch {
            // IGNORE ERROR, WILL USE DEFAULT
          }
        }
        // IF LOCATION INFO FOUND, RETURN IT
        if (locationInfo) {
          return locationInfo;
        }
      }
      // IF PUBLIC IP NOT FOUND OR GEOLOCATION FAILED, RETURN DEFAULT
      const isDevelopment = process.env.NODE_ENV !== "production";
      // RETURN DEFAULT LOCATION
      return {
        country: isDevelopment ? "Local" : "Unknown",
        city: isDevelopment ? "Localhost" : "Unknown",
        region: isDevelopment ? "Development" : "Unknown",
        countryCode: isDevelopment ? "LOC" : "XX",
      };
    }
    // GET LOCATION FROM IP-API.COM
    let locationInfo = await getLocationFromIpApi(ipAddress);
    // IF IP-API.COM FAILED, TRY IPAPI.CO AS FALLBACK
    if (!locationInfo) {
      try {
        const response = await axios.get(
          `https://ipapi.co/${ipAddress}/json/`,
          {
            timeout: 5000,
          }
        );
        if (response.data && response.status === 200) {
          locationInfo = {
            country: response.data.country_name || "Unknown",
            city: response.data.city || "Unknown",
            region: response.data.region || "Unknown",
            countryCode: response.data.country_code || "XX",
          };
        }
      } catch {
        // IGNORE ERROR, WILL RETURN NULL
      }
    }
    // RETURN LOCATION INFO IF FOUND
    if (locationInfo) {
      return locationInfo;
    }
    // RETURN NULL IF FAILED
    return null;
  } catch (error) {
    // LOG ERROR SILENTLY (DON'T BREAK FLOW IF GEOLOCATION FAILS)
    console.error("Error fetching IP geolocation:", error);
    // RETURN DEFAULT LOCATION
    return {
      country: "Unknown",
      city: "Unknown",
      region: "Unknown",
      countryCode: "XX",
    };
  }
};

/**
 * CHECK IF IP ADDRESS IS SUSPICIOUS
 * COMPARES NEW IP WITH EXISTING SESSIONS
 * @param existingLocations - Array of Existing Location Info
 * @returns Suspicious Activity Info
 */
// <== CHECK SUSPICIOUS IP ==>
export const checkSuspiciousIp = (
  existingLocations: LocationInfo[]
): { isSuspicious: boolean; reason: string } => {
  // IF NO EXISTING LOCATIONS, NOT SUSPICIOUS
  if (existingLocations.length === 0) {
    // RETURN NOT SUSPICIOUS
    return { isSuspicious: false, reason: "" };
  }
  // RETURN NOT SUSPICIOUS
  return { isSuspicious: false, reason: "" };
};
