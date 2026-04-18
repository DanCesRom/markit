# backend/app/models/password_reset.py
from sqlalchemy import Column, Integer, String, TIMESTAMP, ForeignKey, func, Boolean
from sqlalchemy.orm import relationship
from backend.app.core.database import Base


class PasswordResetCode(Base):
    __tablename__ = "password_reset_codes"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    email = Column(String(120), nullable=False, index=True)

    # "email" | "sms"
    channel = Column(String(10), nullable=False)

    code_hash = Column(String(128), nullable=False)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)

    attempts = Column(Integer, nullable=False, default=0)
    is_used = Column(Boolean, nullable=False, default=False)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    user = relationship("User", backref="password_reset_codes")