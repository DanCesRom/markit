from sqlalchemy import Column, Integer, ForeignKey, Enum
from sqlalchemy.orm import relationship
import enum

from backend.app.core.database import Base


class PreferenceType(enum.Enum):
    brand = "brand"
    supermarket = "supermarket"


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    preference_type = Column(
        Enum(PreferenceType),
        nullable=False
    )

    reference_id = Column(
        Integer,
        nullable=False
    )
    # brand_id o supermarket_id segun el tipo

    user = relationship("User")