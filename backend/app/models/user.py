from sqlalchemy import (
    Column,
    Integer,
    String,
    Enum,
    TIMESTAMP,
    Date,
    Boolean,
    func
)
from backend.app.core.database import Base
import enum


class UserStatus(enum.Enum):
    active = "active"
    blocked = "blocked"
    inactive = "inactive"


class UserRole(enum.Enum):
    user = "user"
    admin = "admin"


class DocumentType(enum.Enum):
    cedula = "cedula"
    pasaporte = "pasaporte"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    first_name = Column(String(80), nullable=True)
    last_name = Column(String(80), nullable=True)
    full_name = Column(String(120), nullable=False)

    email = Column(String(120), nullable=False, unique=True, index=True)
    phone = Column(String(20), nullable=True)

    birth_date = Column(Date, nullable=True)

    document_type = Column(
        Enum(DocumentType, name="document_type"),
        nullable=True
    )
    document_number = Column(String(30), nullable=True)

    accepted_legal = Column(Boolean, nullable=False, server_default="false")

    status = Column(
        Enum(UserStatus, name="user_status"),
        default=UserStatus.active,
        nullable=False
    )

    role = Column(
        Enum(UserRole, name="user_role"),
        default=UserRole.user,
        nullable=False
    )

    created_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now()
    )

    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    deleted_at = Column(TIMESTAMP(timezone=True), nullable=True)