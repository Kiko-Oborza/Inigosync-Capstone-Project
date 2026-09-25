export function paidCheckoutPayment(attributes: any): { paymentId: string; amountMinor: number } | null {
  const payment = Array.isArray(attributes?.payments)
    ? attributes.payments.find((entry: any) => entry?.attributes?.status === "paid" || entry?.status === "paid")
    : null;
  if (!payment) return null;
  const paymentAttributes = payment.attributes ?? payment;
  const paymentId = payment.id;
  const amountMinor = Number(paymentAttributes.amount);
  if (typeof paymentId !== "string" || !Number.isSafeInteger(amountMinor) || amountMinor <= 0
      || String(paymentAttributes.currency || "").toUpperCase() !== "PHP") return null;
  return { paymentId, amountMinor };
}
