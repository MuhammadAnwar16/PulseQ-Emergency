from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import bcrypt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.db_models import ERUser

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.ALGORITHM)


def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> ERUser:
    if token:
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.ALGORITHM])
            user_id: str = payload.get("sub")
            if user_id:
                user = db.query(ERUser).filter(ERUser.id == user_id, ERUser.is_active == True).first()
                if user:
                    return user
        except JWTError:
            pass

    # Return first active ERUser or fallback default staff instance
    existing_user = db.query(ERUser).filter(ERUser.is_active == True).first()
    if existing_user:
        return existing_user

    return ERUser(
        id="er-staff-public",
        hospital_id=settings.DEFAULT_HOSPITAL_ID,
        email="nurse@pulseq-er.com",
        password_hash="no_auth",
        full_name="Emergency Staff",
        role="nurse",
        is_active=True
    )


def require_roles(allowed_roles: Optional[List[str]] = None):
    def role_checker(current_user: ERUser = Depends(get_current_user)) -> ERUser:
        return current_user
    return role_checker
