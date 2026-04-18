// src/config/categoryArt.ts

// Default/fallback: si un slug no tiene override por supermercado
export const CATEGORY_ART: Record<string, string> = {
  // slugs compartidos
  "bebidas": "/category/bebidas.png",
  "frutas-y-vegetales": "/category/frutas-vegetales.png",

  // Nacional
  "despensa": "/category/despensa.png",
  "salud-y-belleza": "/category/salud-belleza.png",
  "limpieza-y-desechables": "/category/limpieza.png",
  "cervezas-vinos-y-licores": "/category/licores.png",
  "quesos-y-embutidos": "/category/quesos-embutidos.png",
  "lacteos-y-huevos": "/category/lacteos-huevos.png",
  "bebe": "/category/bebe.png",
  "panaderia-y-reposteria": "/category/panaderia.png",
  "carnes-pescados-y-mariscos": "/category/carnes-pescados.png",
  "congelados": "/category/congelados.png",
  "complementos-del-hogar": "/category/hogar.png",
  "mascotas": "/category/mascotas.png",
  "platos-preparados": "/category/platos-preparados.png",

  // Sirena
  "cuidado-personal-y-belleza": "/category/cuidado-personal.png",
  "alimentacion": "/category/alimentacion.png",
  "limpieza": "/category/limpieza.png",
  "bebes": "/category/bebe.png",
  "salud-bienestar": "/category/salud-bienestar.png",
};

// Overrides por supermercado (si quieres que el mismo slug tenga imagen distinta por mercado)
export const CATEGORY_ART_BY_MARKET: Record<string, Record<string, string>> = {
  // OJO: estas keys deben coincidir con m.name.toLowerCase()
  nacional: {
    // ejemplo: puedes poner variantes si quieres que Nacional tenga arte distinto
    // "bebidas": "/category/nacional/bebidas.png",
  },
  "la sirena": {
    // ejemplo: variantes de La Sirena
    // "bebidas": "/category/sirena/bebidas.png",
  },
};