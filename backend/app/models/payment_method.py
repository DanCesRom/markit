from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    Enum,
    TIMESTAMP,
    ForeignKey,
    func
)
from sqlalchemy.orm import relationship
import enum

from backend.app.core.database import Base


class PaymentMethodStatus(enum.Enum):
    active = "active"
    inactive = "inactive"


class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    brand = Column(String(30), nullable=False)
    last4 = Column(String(4), nullable=False)
    exp_month = Column(Integer, nullable=False)
    exp_year = Column(Integer, nullable=False)

    nickname = Column(String(80), nullable=True)

    is_default = Column(Boolean, nullable=False, server_default="false")

    status = Column(
        Enum(PaymentMethodStatus, name="payment_method_status"),
        nullable=False,
        server_default=PaymentMethodStatus.active.value
    )

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    user = relationship("User", backref="payment_methods")