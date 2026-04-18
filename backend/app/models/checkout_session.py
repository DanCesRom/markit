from sqlalchemy import Column, Integer, ForeignKey, DateTime, Enum, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from backend.app.models.order import DeliveryType


from backend.app.core.database import Base


class CheckoutSessionStatus(enum.Enum):
    created = "created"
    paid = "paid"
    completed = "completed"
    cancelled = "cancelled"


class CheckoutSession(Base):
    __tablename__ = "checkout_sessions"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    cart_id = Column(Integer, ForeignKey("carts.id"), nullable=False)

    total = Column(Numeric(10, 2), nullable=False, server_default="0")
    delivery_type = Column(Enum(DeliveryType, name="delivery_type"), nullable=False)  # opcional (si ya tienes Enum DeliveryType puedes usarlo)

    status = Column(
        Enum(CheckoutSessionStatus, name="checkout_session_status"),
        nullable=False,
        server_default=CheckoutSessionStatus.created.value
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    orders = relationship("Order", back_populates="checkout_session")