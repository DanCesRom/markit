// src/config/navIcons.ts
import shop from "../assets/nav/shop.svg";
import categories from "../assets/nav/categories.svg";
import cart from "../assets/nav/cart.svg";
import account from "../assets/nav/account.svg";

// Si luego quieres variantes active distintas, importas otros svgs y los cambias aquí.
export const NAV_ICONS = {
  shop,
  categories,
  cart,
  account,

  shopActive: shop,
  categoriesActive: categories,
  cartActive: cart,
  accountActive: account,
} as const;