# backend/app/models/supermarket_raw_item.py
from sqlalchemy import Column, Integer, ForeignKey, String, TIMESTAMP, func, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class SupermarketRawItem(Base):
    __tablename__ = "supermarket_raw_items"

    id = Column(Integer, primary_key=True, index=True)

    supermarket_id = Column(Integer, ForeignKey("supermarkets.id", ondelete="CASCADE"), nullable=False)

    external_id = Column(String(120), nullable=False)
    external_sku = Column(String(120), nullable=True)

    payload = Column(JSONB, nullable=False)
    payload_hash = Column(String(64), nullable=False)

    fetched_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    supermarket = relationship("Supermarket", backref="raw_items")

    __table_args__ = (
        UniqueConstraint("supermarket_id", "external_id", name="uq_raw_supermarket_external_id"),
        Index("ix_raw_supermarket_id", "supermarket_id"),
    )