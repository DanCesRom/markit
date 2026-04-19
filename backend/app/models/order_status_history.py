from sqlalchemy import Column, Integer, String, Enum, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from backend.app.core.database import Base


class ChangedBy(enum.Enum):
    system = "system"
    user = "user"
    admin = "admin"


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id = Column(Integer, primary_key=True, index=True)

    order_id = Column(
        Integer,
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    status = Column(String(50), nullable=False)

    changed_by = Column(
        Enum(ChangedBy, name="changed_by_enum"),
        nullable=False
    )

    changed_at = Column(DateTime(timezone=True), server_default=func.now())

    # relacion ORM (opcional, pero recomendable)
    order = relationship("Order", back_populates="status_history")
