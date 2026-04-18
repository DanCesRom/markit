from sqlalchemy import (
    Column,
    Integer,
    String,
    Enum,
    TIMESTAMP,
    ForeignKey,
    func
)
from sqlalchemy.orm import relationship
from backend.app.core.database import Base
import enum


class CredentialStatus(enum.Enum):
    active = "active"
    blocked = "blocked"
    inactive = "inactive"


class UserCredential(Base):
    __tablename__ = "user_credentials"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True
    )

    password_hash = Column(String(255), nullable=False)

    last_login_at = Column(TIMESTAMP(timezone=True), nullable=True)

    status = Column(
        Enum(CredentialStatus, name="credential_status"),
        default=CredentialStatus.active,
        nullable=False
    )

    failed_attempts = Column(Integer, default=0, nullable=False)

    locked_until = Column(TIMESTAMP(timezone=True), nullable=True)

    created_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now()
    )

    # relacion ORM
    user = relationship("User", backref="credentials")