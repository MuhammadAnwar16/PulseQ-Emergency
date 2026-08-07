import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

logger = logging.getLogger("app.database")

db_url = settings.DATABASE_URL
connect_args = {}
engine_kwargs = {"pool_pre_ping": True}

if db_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    # PostgreSQL pool settings for high-concurrency real production use
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

try:
    engine = create_engine(
        db_url,
        connect_args=connect_args,
        **engine_kwargs
    )
    # Test connection
    with engine.connect() as conn:
        pass
    logger.info(f"Database connected successfully using: {db_url.split('@')[-1] if '@' in db_url else db_url}")
except Exception as e:
    if not db_url.startswith("sqlite"):
        logger.warning(f"Could not connect to PostgreSQL at {db_url}: {e}. Falling back to SQLite for local development.")
        db_url = "sqlite:///./emergency.db"
        connect_args = {"check_same_thread": False}
        engine = create_engine(
            db_url,
            connect_args=connect_args,
            pool_pre_ping=True
        )
    else:
        raise

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
