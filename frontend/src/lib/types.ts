export type Product = {
  id: number;
  name: string;
  price?: number;
  brand?: string;
  supermarket_id?: number;
  image_url?: string;
};

export type Address = {
  id: number;
  label: string;
  line1: string;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  notes?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;

  building_type?: string | null;
  formatted_address?: string | null;
  reference_note?: string | null;
  delivery_instructions?: string | null;

  is_default: boolean;
};

export type AddressCreateInput = {
  label: string;
  line1: string;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;

  building_type?: string | null;
  formatted_address?: string | null;
  reference_note?: string | null;
  delivery_instructions?: string | null;

  is_default?: boolean;
};

export type AddressUpdateInput = Partial<AddressCreateInput>;

export type OrderItem = {
  id: number;
  product_name_snapshot: string;
  unit_price: string;
  quantity: string;
  line_total: string;
};

export type Order = {
  id: number;
  cart_id: number;
  supermarket_id: number;
  supermarket_name: string;
  subtotal: string;
  tax: string;
  total: string;
  delivery_type: string;
  status: string;
  created_at: string;

  delivery_address_label?: string | null;
  delivery_address_line1?: string | null;

  items: OrderItem[];
};

export type OrderListResponse = {
  orders: Order[];
};

export type OrderStatusHistoryItem = {
  id: number;
  order_id: number;
  status: string;
  changed_by: string;
  changed_at: string;
};

export type OrderStatusHistoryListResponse = {
  history: OrderStatusHistoryItem[];
};