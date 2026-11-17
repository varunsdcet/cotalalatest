export type ProofOrderState = {
  quantity: number;
  deliveryMethod: "pickup" | "ship";
  shippingAddress: string;
  courier: "standard" | "express" | "overnight";
};

export const DEFAULT_PROOF_ORDER: ProofOrderState = {
  quantity: 50,
  deliveryMethod: "pickup",
  shippingAddress: "",
  courier: "standard",
};
