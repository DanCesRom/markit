from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.database import Base, engine

from backend.app.api.products import router as products_router
from backend.app.api.cart import router as cart_router
from backend.app.api.checkout import router as checkout_router
from backend.app.api.orders import router as orders_router
from backend.app.api.order_status import router as order_status_router
from backend.app.api.payments import router as payments_router
from backend.app.api.payment_methods import router as payment_methods_router
from backend.app.api import purchases
from backend.app.api.auth import router as auth_router
from backend.app.api.admin_test import router as admin_router
from backend.app.api.admin_supermarkets import router as admin_supermarkets_router
from backend.app.api.admin_pricing_inventory import router as admin_pricing_router
from backend.app.ai.router import router as ai_router
from backend.app.api.supermarkets_public import router as supermarkets_public_router
from backend.app.api.addresses import router as addresses_router

from backend.app.models import (
    user, user_credentials, user_sessions,
    supermarket, brand, catalog_product,
    category, supermarket_category,
    supermarket_product, supermarket_product_price,
    product_inventory,
    supermarket_raw_item,
    cart, cart_item, order, order_item,
    order_status_history, payment, payment_method,
    address,
)

app = FastAPI(title="Markit API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://172.22.208.1:5173",
        "http://10.0.19.69:5173",
        "https://tucancha.com.do",
        "https://www.tucancha.com.do",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"ok": True, "service": "Markit API"}

app.include_router(products_router, prefix="/api")
app.include_router(cart_router, prefix="/api")
app.include_router(checkout_router, prefix="/api")
app.include_router(orders_router, prefix="/api")
app.include_router(order_status_router, prefix="/api")
app.include_router(payments_router, prefix="/api")
app.include_router(payment_methods_router, prefix="/api")
app.include_router(purchases.router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(admin_supermarkets_router, prefix="/api")
app.include_router(admin_pricing_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(supermarkets_public_router, prefix="/api")
app.include_router(addresses_router, prefix="/api")

@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)