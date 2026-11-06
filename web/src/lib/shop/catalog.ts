export const PRODUCTS = [
  { sku: "daily-notebook", name: "Daily Notebook", category: "For your ideas", price: 1200, image: "/shop/notebook.jpg", description: "A fresh page for whatever comes next.", color: "#e8e7e1" },
  { sku: "everyday-tote", name: "Everyday Tote", category: "For the everyday", price: 1800, image: "/shop/tote.jpg", description: "Take the little things with you.", color: "#e4e8e5" },
  { sku: "forest-bottle", name: "Forest Bottle", category: "For the long way", price: 2400, image: "/shop/bottle.jpg", description: "A little refresh, wherever you go.", color: "#eef0e7" },
] as const;
export type CartLine = { sku: string; quantity: number };
export type PricedLine = CartLine & { name: string; unitPrice: number; subtotal: number };
export function priceCart(input: unknown): { items: PricedLine[]; total: number } {
  if (!Array.isArray(input) || !input.length || input.length > PRODUCTS.length) throw new Error("Choose at least one product; at most three distinct items are supported.");
  const seen = new Set<string>();
  const items = input.map(value => {
    if (!value || typeof value !== "object" || typeof value.sku !== "string" || !Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > 10) throw new Error("Each product quantity must be between 1 and 10.");
    const product = PRODUCTS.find(product => product.sku === value.sku);
    if (!product || seen.has(product.sku)) throw new Error("The cart contains an unknown or duplicate product.");
    seen.add(product.sku);
    return { sku: product.sku, name: product.name, quantity: value.quantity, unitPrice: product.price, subtotal: product.price * value.quantity };
  });
  return { items, total: items.reduce((total, item) => total + item.subtotal, 0) };
}
export const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
