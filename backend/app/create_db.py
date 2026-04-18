# backend/app/create_db.py

from backend.app.core.database import Base, engine

# 🔥 IMPORTANTE: importar TODOS los models
from backend.app.models import (
    user,
    user_credentials,
    user_sessions,
    brand,
    catalog_product,
    supermarket,
    supermarket_product,
    supermarket_product_price,
    product_inventory,
    supermarket_raw_item,
    cart,
    cart_item,
    checkout_session,
    order,
    order_item,
    order_status_history,
    payment,
    payment_method,
    password_reset,
)

def main():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("✅ Tables created successfully.")

if __name__ == "__main__":
    main()