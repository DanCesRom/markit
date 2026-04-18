from sqlalchemy import Column, Integer, Enum, Numeric, ForeignKey, DateTime, String
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from backend.app.core.database import Base


class DeliveryType(enum.Enum):
    delivery = "delivery"
    pickup = "pickup"


class OrderStatus(enum.Enum):
    created = "created"
    paid = "paid"
    preparing = "preparing"
    completed = "completed"
    cancelled = "cancelled"


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    cart_id = Column(Integer, ForeignKey("carts.id"), nullable=False)

    checkout_session_id = Column(Integer, ForeignKey("checkout_sessions.id"), nullable=True)
    checkout_session = relationship("CheckoutSession", back_populates="orders")

    supermarket_id = Column(Integer, ForeignKey("supermarkets.id"), nullable=False)

    subtotal = Column(Numeric(10, 2), nullable=False)
    tax = Column(Numeric(10, 2), nullable=False, server_default="0")
    total = Column(Numeric(10, 2), nullable=False)

    delivery_type = Column(Enum(DeliveryType, name="delivery_type"), nullable=True)
    status = Column(Enum(OrderStatus), nullable=False, server_default=OrderStatus.created.value)

    # NUEVO: snapshot address
    delivery_address_label = Column(String(50), nullable=True)
    delivery_address_line1 = Column(String(180), nullable=True)
    delivery_address_line2 = Column(String(180), nullable=True)
    delivery_address_city = Column(String(80), nullable=True)
    delivery_address_state = Column(String(80), nullable=True)
    delivery_address_postal_code = Column(String(30), nullable=True)
    delivery_address_notes = Column(String(180), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # relaciones
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

    status_history = relationship(
        "OrderStatusHistory",
        back_populates="order",
        cascade="all, delete-orphan"
    )

    payments = relationship(
        "Payment",
        back_populates="order",
        cascade="all, delete-orphan"
    )