from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.db_models import ERUser, ERFailedLogin
from app.schemas import LoginRequest, TokenResponse, UserResponse
from app.security import verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(credentials: LoginRequest, request: Request, db: Session = Depends(get_db)):
    email = credentials.email.lower().strip()

    # Password length / non-empty check
    if not credentials.password or len(credentials.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long",
        )

    # Client IP identification
    client_ip = request.client.host if request.client else "127.0.0.1"
    identifier = f"{email}:{client_ip}"

    # Persistent Lockout Check (Stored in DB so restarts & multi-process deploys do not wipe it)
    now = datetime.utcnow()
    failed_record = db.query(ERFailedLogin).filter(ERFailedLogin.identifier == identifier).first()

    if failed_record and failed_record.locked_until:
        if failed_record.locked_until > now:
            remaining_seconds = int((failed_record.locked_until - now).total_seconds())
            remaining_minutes = max(1, remaining_seconds // 60)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Account is locked for {remaining_minutes} more minute(s)."
            )
        else:
            # Lockout expired, reset lockout status
            failed_record.locked_until = None
            failed_record.attempts = 0
            db.commit()

    user = db.query(ERUser).filter(ERUser.email == email).first()
    is_valid_password = user and verify_password(credentials.password, user.password_hash)

    if not user or not is_valid_password:
        if not failed_record:
            failed_record = ERFailedLogin(
                identifier=identifier,
                email=email,
                ip_address=client_ip,
                attempts=1,
                last_attempt_at=now
            )
            db.add(failed_record)
        else:
            failed_record.attempts += 1
            failed_record.last_attempt_at = now

        if failed_record.attempts >= settings.MAX_LOGIN_ATTEMPTS:
            failed_record.locked_until = now + timedelta(minutes=settings.LOCKOUT_MINUTES)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Account locked due to {settings.MAX_LOGIN_ATTEMPTS} consecutive failed attempts. Locked for {settings.LOCKOUT_MINUTES} minutes."
            )

        db.commit()
        remaining_attempts = settings.MAX_LOGIN_ATTEMPTS - failed_record.attempts
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid email or password. {remaining_attempts} attempt(s) remaining before lockout.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    # Successful login: Clear failed login attempts in DB
    if failed_record:
        failed_record.attempts = 0
        failed_record.locked_until = None
        db.commit()

    access_token = create_access_token(data={"sub": user.id, "role": user.role, "hospital_id": user.hospital_id})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.get("/me", response_model=UserResponse)
def get_me(current_user: ERUser = Depends(get_current_user)):
    return current_user
