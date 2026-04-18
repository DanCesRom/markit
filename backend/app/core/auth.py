# backend/app/core/auth.py
import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from jose import jwt

SECRET_KEY = os.getenv("MARKIT_SECRET_KEY", "dev-secret-change-this")
ALGORITHM = os.getenv("MARKIT_JWT_ALG", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("MARKIT_ACCESS_TOKEN_MINUTES", "1440"))  # 24h


def create_access_token(subject: str, expires_minutes: Optional[int] = None, extra: Optional[Dict[str, Any]] = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=expires_minutes if expires_minutes is not None else ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode: Dict[str, Any] = {"sub": subject, "exp": expire}
    if extra:
        to_encode.update(extra)
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    """
    Devuelve el payload (dict) o lanza JWTError.
    """
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])