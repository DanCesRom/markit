from fastapi import Depends, HTTPException
from backend.app.api.deps import get_current_user
from backend.app.models.user import User, UserRole


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    role = (
        current_user.role.value
        if hasattr(current_user.role, "value")
        else str(current_user.role)
    )

    if role != UserRole.admin.value:
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )

    return current_user