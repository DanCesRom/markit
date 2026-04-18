from sqlalchemy import Column, Integer, Enum, Numeric, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from backend.app.core.database import Base


class PaymentMethodType(enum.Enum):
    card = "card"
    cash = "cash"


class PaymentStatus(enum.Enum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)

    payment_method = Column(Enum(PaymentMethodType, name="payment_method_type"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)

    status = Column(Enum(PaymentStatus, name="payment_status"), nullable=False, default=PaymentStatus.paid)

    transaction_ref = Column(String(120), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    order = relationship("Order", back_populates="payments")
