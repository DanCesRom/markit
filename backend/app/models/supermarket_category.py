# backend/app/models/supermarket_category.py
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, UniqueConstraint, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class SupermarketCategory(Base):
    __tablename__ = "supermarket_categories"

    id = Column(Integer, primary_key=True, index=True)

    supermarket_id = Column(
        Integer,
        ForeignKey("supermarkets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    category_id = Column(
        Integer,
        ForeignKey("categories.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # raw del súper
    name_raw = Column(String(180), nullable=False)
    slug_raw = Column(String(180), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    supermarket = relationship("Supermarket", backref="supermarket_categories")
    category = relationship("Category", back_populates="supermarket_categories")

    products = relationship("SupermarketProduct", back_populates="supermarket_category")

    __table_args__ = (
        UniqueConstraint("supermarket_id", "slug_raw", name="uq_supermarket_categories_slug_raw"),
        Index("ix_supermarket_categories_supermarket", "supermarket_id"),
    )