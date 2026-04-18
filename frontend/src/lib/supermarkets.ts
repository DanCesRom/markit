import { apiGet } from "./api";

export type Supermarket = { id: number; name: string };

export async function fetchSupermarkets(): Promise<Supermarket[]> {
  return apiGet<Supermarket[]>("/supermarkets");
}