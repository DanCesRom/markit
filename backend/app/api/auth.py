# backend/app/api/auth.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional, Literal, List
from datetime import datetime, timedelta, timezone
import secrets
import hashlib

from backend.app.core.database import get_db
from backend.app.core.auth import create_access_token
from backend.app.core.passwords import verify_password, hash_password

from backend.app.api.deps import get_current_user
from backend.app.models.user import User, UserStatus
from backend.app.models.user_credentials import UserCredential
from backend.app.models.password_reset import PasswordResetCode



router = APIRouter(prefix="/auth", tags=["Auth"])


# ===== Schemas =====

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    status: Optional[str] = None


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    full_name: str = Field(..., min_length=2, max_length=120)
    password: str = Field(..., min_length=6, max_length=100)

    first_name: str = Field(..., min_length=2, max_length=80)
    last_name: str = Field(..., min_length=2, max_length=80)

    birth_date: str = Field(..., min_length=10, max_length=10)
    document_type: Literal["cedula", "pasaporte"]
    document_number: str = Field(..., min_length=3, max_length=30)

    phone: str = Field(..., min_length=7, max_length=20)
    accepted_legal: bool


class RegisterResponse(BaseModel):
    message: str
    email: str
    status: str
    verify_code: str  # MVP


class VerifyRequest(BaseModel):
    email: str
    code: str


class VerifyResponse(BaseModel):
    message: str
    email: str
    status: str


# ---- Forgot password ----

ForgotChannel = Literal["email", "sms"]

class ForgotOptionsRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)

class ForgotOption(BaseModel):
    channel: ForgotChannel
    label: str
    value_masked: str

class ForgotOptionsResponse(BaseModel):
    email: str
    options: List[ForgotOption]

class ForgotSendRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    channel: ForgotChannel

class ForgotSendResponse(BaseModel):
    message: str
    # MVP: devolvemos el código para probar sin email/SMS real
    mvp_code: Optional[str] = None

class ForgotVerifyRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    code: str = Field(..., min_length=4, max_length=10)

class ForgotVerifyResponse(BaseModel):
    message: str
    reset_token: str  # token de corto plazo para resetear password

class ForgotResetRequest(BaseModel):
    reset_token: str
    new_password: str = Field(..., min_length=6, max_length=100)

class ForgotResetResponse(BaseModel):
    message: str


# ===== Helpers =====

MVP_VERIFY_CODE = "123456"

PWD_RESET_CODE_TTL_MIN = 10
PWD_RESET_TOKEN_TTL_MIN = 15
PWD_RESET_MAX_ATTEMPTS = 5


def _mask_email(email: str) -> str:
    # abc---@yourdomain.com style
    if "@" not in email:
        return email
    name, dom = email.split("@", 1)
    if len(name) <= 3:
        masked_name = (name[:1] + "---") if name else "---"
    else:
        masked_name = name[:3] + "---"
    return f"{masked_name}@{dom}"

def _mask_phone(phone: str) -> str:
    # +1888--------111 style
    if not phone:
        return ""
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) <= 3:
        return phone
    last3 = digits[-3:]
    # conserva prefijo + si existe
    prefix = "+" if phone.strip().startswith("+") else ""
    return f"{prefix}{digits[:-3]}{'-'*8}{last3}"

def _hash_code(code: str) -> str:
    # hash simple para OTP (suficiente para MVP; si quieres, le metemos salt por registro)
    return hashlib.sha256(code.encode("utf-8")).hexdigest()

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)

def _cleanup_old_resets(db: Session, email: str):
    # opcional: marca como usados/expirados para no acumular
    now = _now_utc()
    db.query(PasswordResetCode).filter(
        PasswordResetCode.email == email,
        PasswordResetCode.is_used == False,
        PasswordResetCode.expires_at < now,
    ).update({PasswordResetCode.is_used: True}, synchronize_session=False)
    db.commit()


# ===== Endpoints existentes =====

@router.post("/register", response_model=RegisterResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    if not payload.accepted_legal:
        raise HTTPException(status_code=400, detail="You must accept the legal terms")

    from datetime import date

    try:
        birth_date = date.fromisoformat(payload.birth_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid birth date")

    user = User(
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        full_name=payload.full_name.strip(),
        email=email,
        phone=payload.phone.strip(),
        birth_date=birth_date,
        document_type=payload.document_type,
        document_number=payload.document_number.strip(),
        accepted_legal=payload.accepted_legal,
        status=UserStatus.inactive,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    cred = UserCredential(
        user_id=user.id,
        password_hash=hash_password(payload.password),
    )
    db.add(cred)
    db.commit()

    return RegisterResponse(
        message="User registered. Please verify your email.",
        email=user.email,
        status=user.status.value if hasattr(user.status, "value") else str(user.status),
        verify_code=MVP_VERIFY_CODE,
    )


@router.post("/verify", response_model=VerifyResponse)
def verify_email(payload: VerifyRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    code = payload.code.strip()

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if code != MVP_VERIFY_CODE:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    user.status = UserStatus.active
    db.commit()

    return VerifyResponse(
        message="Email verified successfully.",
        email=user.email,
        status=user.status.value if hasattr(user.status, "value") else str(user.status),
    )


@router.post("/login", response_model=LoginResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    email = (form_data.username or "").strip().lower()
    password = form_data.password

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Please check your email or password and try again")

    if hasattr(user, "status") and user.status != UserStatus.active:
        raise HTTPException(status_code=403, detail="User is not active (verify email first)")

    cred = db.query(UserCredential).filter(UserCredential.user_id == user.id).first()
    if not cred:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not verify_password(password, cred.password_hash):
        raise HTTPException(status_code=401, detail="Please check your email or password and try again")

    token = create_access_token(subject=str(user.id))
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": getattr(current_user, "full_name", None),
        "status": (
            current_user.status.value if hasattr(current_user.status, "value") else str(current_user.status)
        ) if getattr(current_user, "status", None) is not None else None,
    }


# ===== Forgot Password (REAL endpoints) =====

@router.post("/forgot-password/options", response_model=ForgotOptionsResponse)
def forgot_password_options(payload: ForgotOptionsRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()

    user = db.query(User).filter(User.email == email).first()

    # ✅ no revelar si existe o no: siempre respondemos 200 con opciones mínimas
    options: List[ForgotOption] = [
        ForgotOption(channel="email", label="via Email", value_masked=_mask_email(email))
    ]

    if user and user.phone:
        options.insert(0, ForgotOption(channel="sms", label="via SMS", value_masked=_mask_phone(user.phone)))

    return ForgotOptionsResponse(email=email, options=options)


@router.post("/forgot-password/send", response_model=ForgotSendResponse)
def forgot_password_send(payload: ForgotSendRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    channel = payload.channel

    _cleanup_old_resets(db, email)

    user = db.query(User).filter(User.email == email).first()

    # ✅ si el usuario no existe, respondemos OK igual (anti-enumeration)
    # pero NO creamos code real
    if not user:
        return ForgotSendResponse(message="If the account exists, a code has been sent.")

    if channel == "sms" and not user.phone:
        # no permitimos sms si no hay phone
        raise HTTPException(status_code=400, detail="SMS is not available for this account")

    # Genera OTP real
    code = f"{secrets.randbelow(1_000_000):06d}"
    code_hash = _hash_code(code)
    expires_at = _now_utc() + timedelta(minutes=PWD_RESET_CODE_TTL_MIN)

    rec = PasswordResetCode(
        user_id=user.id,
        email=email,
        channel=channel,
        code_hash=code_hash,
        expires_at=expires_at,
        attempts=0,
        is_used=False,
    )
    db.add(rec)
    db.commit()

    # MVP: devolvemos el code (luego lo mandas por email/sms real)
    return ForgotSendResponse(
        message="If the account exists, a code has been sent.",
        mvp_code=code,
    )


@router.post("/forgot-password/verify", response_model=ForgotVerifyResponse)
def forgot_password_verify(payload: ForgotVerifyRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    code = payload.code.strip()

    user = db.query(User).filter(User.email == email).first()
    if not user:
        # no revelar: mismo mensaje
        raise HTTPException(status_code=400, detail="This code is not correct")

    now = _now_utc()

    rec = (
        db.query(PasswordResetCode)
        .filter(
            PasswordResetCode.email == email,
            PasswordResetCode.user_id == user.id,
            PasswordResetCode.is_used == False,
        )
        .order_by(PasswordResetCode.created_at.desc())
        .first()
    )

    if not rec or rec.expires_at < now:
        raise HTTPException(status_code=400, detail="This code is not correct")

    if rec.attempts >= PWD_RESET_MAX_ATTEMPTS:
        rec.is_used = True
        db.commit()
        raise HTTPException(status_code=400, detail="This code is not correct")

    if _hash_code(code) != rec.code_hash:
        rec.attempts += 1
        db.commit()
        raise HTTPException(status_code=400, detail="This code is not correct")

    # OK
    rec.is_used = True
    db.commit()

    # Token corto propósito pwd_reset
    reset_token = create_access_token(
        subject=str(user.id),
        expires_minutes=PWD_RESET_TOKEN_TTL_MIN,
        extra={"purpose": "pwd_reset", "email": email},
    )

    return ForgotVerifyResponse(message="Code verified", reset_token=reset_token)


@router.post("/forgot-password/reset", response_model=ForgotResetResponse)
def forgot_password_reset(payload: ForgotResetRequest, db: Session = Depends(get_db)):
    # Validamos reset_token con tu decode_token vía create_access_token extra
    from backend.app.core.auth import decode_token
    from jose import JWTError

    try:
        data = decode_token(payload.reset_token)
        if data.get("purpose") != "pwd_reset":
            raise HTTPException(status_code=401, detail="Invalid token")
        user_id = int(data.get("sub"))
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")

    cred = db.query(UserCredential).filter(UserCredential.user_id == user.id).first()
    if not cred:
        raise HTTPException(status_code=400, detail="Invalid credentials")

    cred.password_hash = hash_password(payload.new_password)
    cred.failed_attempts = 0
    cred.locked_until = None
    db.commit()

    return ForgotResetResponse(message="Password updated successfully")


#Logout System

class LogoutResponse(BaseModel):
    message: str = "Logged out"

@router.post("/logout", response_model=LogoutResponse)
def logout(current_user: User = Depends(get_current_user)):
    # JWT stateless: no hay nada que invalidar server-side.
    # Si luego implementas blacklist/refresh tokens, aquí haces revoke.
    return LogoutResponse()