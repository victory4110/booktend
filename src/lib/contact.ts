/**
 * Phone helpers for the customer card.
 *
 * A `tel:` link is not portable: macOS hands it to FaceTime, Windows asks which
 * app to use, and a machine with neither installed does nothing at all. The card
 * therefore shows the number as plain text and offers explicit Copy, Call and
 * WhatsApp actions, so what a click does never depends on the visitor's platform.
 */

/**
 * Dialers want digits, with an optional leading `+`. Spaces, dashes and brackets
 * survive in some browsers but are stripped by others, so normalise here.
 */
export function phoneHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return phone.trim().startsWith('+') ? `tel:+${digits}` : `tel:${digits}`;
}

/**
 * `wa.me` only accepts international numbers. A locally written `0801…` number
 * cannot become a wa.me link without guessing the customer's country code, so
 * this returns null unless the number was written with a leading `+` and has a
 * plausible length, and the card hides the WhatsApp action in that case.
 */
export function whatsappHref(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!trimmed.startsWith('+') || digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
}
