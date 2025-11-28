/**
 * Cleans and formats phone numbers to a standard format
 * Handles various Kenyan phone number formats and converts them to international format
 *
 * @param phone - Phone number string (can be null or undefined)
 * @returns Cleaned phone number string or null if input is null/undefined/empty
 */
const cleanPhone = (phone: string | null | undefined): string | null => {
  // Return null if phone is null, undefined, or empty
  if (!phone || phone.trim() === "") {
    return null;
  }

  const prefix: string = "+254";
  let result: string = "";
  // Remove all whitespace
  const cleaned = phone.replace(/\s/g, "");

  if (cleaned.length === 0) {
    return null;
  }

  const firstChar = cleaned.charAt(0);

  if (firstChar === "0") {
    // Remove leading 0 and add +254 prefix
    result = prefix + cleaned.slice(1);
  } else if (firstChar === "7") {
    // Add +254 prefix for numbers starting with 7
    result = prefix + cleaned;
  } else if (firstChar === "2") {
    // Add + prefix for numbers starting with 2 (already has country code)
    result = "+" + cleaned;
  } else if (firstChar === "+") {
    // Already has + prefix, keep as is
    result = cleaned;
  } else if (firstChar === "1") {
    // Add +254 prefix for numbers starting with 1
    result = prefix + cleaned;
  } else {
    // If format doesn't match any pattern, return as is (might be international format)
    result = cleaned;
  }

  return result;
};

export default cleanPhone;
