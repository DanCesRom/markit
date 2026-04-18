# backend/app/models/category.py
from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(160), nullable=False)
    slug = Column(String(180), nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    supermarket_categories = relationship("SupermarketCategory", back_populates="category")

    __table_args__ = (
        UniqueConstraint("slug", name="uq_categories_slug"),
    )