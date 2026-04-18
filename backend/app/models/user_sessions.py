from sqlalchemy import (
    Column,
    Integer,
    String,
    TIMESTAMP,
    ForeignKey,
    func
)
from sqlalchemy.orm import relationship
from backend.app.core.database import Base


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )

    token = Column(String(255), unique=True, nullable=False)

    ip_address = Column(String(45), nullable=False)

    user_agent = Column(String, nullable=True)

    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)

    created_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now()
    )

    user = relationship("User", backref="sessions")