import { formatMoney } from "../money";
import type { ShoppingIntent } from "../types";

/** Deterministic confirmation sentence shown/spoken before searching. */
export function buildConfirmation(intent: ShoppingIntent): string {
  const bits: string[] = [];

  if (intent.attributes.condition) bits.push(intent.attributes.condition);
  if (intent.attributes.color) bits.push(intent.attributes.color);

  // Prefer the user's own product words: an inferred category is often a
  // generalization ("football ball" → "sports equipment") and reads wrong.
  const brandModel = [intent.brand, intent.model].filter(Boolean).join(" ");
  const subject = brandModel || intent.searchQuery || intent.productCategory || intent.query;
  bits.push(subject);

  let sentence = `I'm looking for ${bits.join(" ")}`;
  if (intent.attributes.size) sentence += ` in size ${intent.attributes.size}`;
  if (intent.attributes.capacity) sentence += ` with ${intent.attributes.capacity} of storage`;

  if (intent.budget) {
    sentence += `, under ${formatMoney(intent.budget.maximum, intent.budget.currency)}`;
    sentence += intent.budget.includesShipping ? " including delivery" : " excluding delivery";
  }

  return sentence + ".";
}
