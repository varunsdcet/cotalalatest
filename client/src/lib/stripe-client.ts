async function stripeFormPost<T extends { id?: string; error?: { message?: string } }>(
  publishableKey: string,
  path: string,
  fields: Record<string, string>
) {
  const body = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => {
    if (value) body.set(key, value);
  });

  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await res.json()) as T;
  if (!json.id) {
    throw new Error(json.error?.message || `Stripe ${path} failed`);
  }
  return json.id;
}

export async function createStripeCardPaymentMethodId(input: {
  publishableKey: string;
  cardNumber: string;
  expMonth: string;
  expYear: string;
  cvc: string;
  name: string;
  postalCode: string;
}) {
  const expYear = input.expYear.length === 2 ? `20${input.expYear}` : input.expYear;

  try {
    return await stripeFormPost(input.publishableKey, "payment_methods", {
      type: "card",
      "card[number]": input.cardNumber,
      "card[exp_month]": input.expMonth,
      "card[exp_year]": expYear,
      "card[cvc]": input.cvc,
      "billing_details[name]": input.name,
      "billing_details[address][country]": "CA",
      "billing_details[address][postal_code]": input.postalCode,
    });
  } catch {
    const tokenId = await stripeFormPost(input.publishableKey, "tokens", {
      "card[number]": input.cardNumber,
      "card[exp_month]": input.expMonth,
      "card[exp_year]": expYear,
      "card[cvc]": input.cvc,
      "card[name]": input.name,
      "card[address_zip]": input.postalCode,
      "card[address_country]": "CA",
    });

    return stripeFormPost(input.publishableKey, "payment_methods", {
      type: "card",
      "card[token]": tokenId,
      "billing_details[name]": input.name,
      "billing_details[address][country]": "CA",
      "billing_details[address][postal_code]": input.postalCode,
    });
  }
}
