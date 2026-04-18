from fastapi import APIRouter, Depends
from backend.app.api.admin_deps import require_admin
from backend.app.models.user import User

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/ping")
def admin_ping(current_admin: User = Depends(require_admin)):
    return {
        "ok": True,
        "admin_id": current_admin.id,
        "email": current_admin.email,
        "role": current_admin.role.value
    }