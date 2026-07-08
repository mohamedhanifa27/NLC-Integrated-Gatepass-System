import os
from sqlalchemy import create_engine, Column, Integer, String, Date, DateTime, Enum, ForeignKey, Text, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_USER = os.getenv('DB_USER', 'root')
DB_PASSWORD = os.getenv('DB_PASSWORD', '9443631178')
DB_NAME = os.getenv('DB_NAME', 'igps_db')

# Connection string
DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"

# We don't connect immediately in case the DB isn't created yet. We'll provide a get_engine function.
engine = None
SessionLocal = None

Base = declarative_base()

def init_engine():
    global engine, SessionLocal
    engine = create_engine(DATABASE_URL, pool_recycle=3600)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class User(Base):
    __tablename__ = 'Users'
    
    user_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(Enum('employee', 'security', 'admin', 'manager', name='role_enum'), nullable=False)
    department = Column(String(100))
    is_active = Column(Boolean, default=True)

    # Relationships
    passes_requested = relationship("GatePass", foreign_keys="[GatePass.user_id]", back_populates="requester")
    passes_approved = relationship("GatePass", foreign_keys="[GatePass.approved_by]", back_populates="approver")
    activities_verified = relationship("GateActivity", foreign_keys="[GateActivity.verified_by]", back_populates="verifier")


class GatePass(Base):
    __tablename__ = 'GatePass'
    
    pass_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('Users.user_id'), nullable=False)
    reason = Column(String(255), nullable=False)
    request_date = Column(Date, nullable=False)
    exit_time = Column(DateTime, nullable=False)
    return_time = Column(DateTime, nullable=True)
    status = Column(Enum('pending', 'approved', 'rejected', 'used', name='status_enum'), default='pending')
    approved_by = Column(Integer, ForeignKey('Users.user_id'), nullable=True)
    approved_at = Column(DateTime, nullable=True)

    # Relationships
    requester = relationship("User", foreign_keys=[user_id], back_populates="passes_requested")
    approver = relationship("User", foreign_keys=[approved_by], back_populates="passes_approved")
    activity = relationship("GateActivity", back_populates="gate_pass", uselist=False)

    def to_dict(self):
        return {
            "pass_id": f"GP-2025-{self.pass_id:04d}",
            "pass_type": self.requester.role,
            "employee_name": self.requester.name,
            "purpose": self.reason,
            "request_date": self.request_date.isoformat() if self.request_date else None,
            "exit_time": self.exit_time.isoformat() if self.exit_time else None,
            "return_time": self.return_time.isoformat() if self.return_time else None,
            "status": self.status,
            "approved_by": self.approver.name if self.approver else "—"
        }


class GateActivity(Base):
    __tablename__ = 'GateActivity'
    
    log_id = Column(Integer, primary_key=True, autoincrement=True)
    pass_id = Column(Integer, ForeignKey('GatePass.pass_id'), nullable=True)
    pass_type = Column(String(20), default='employee')
    pass_id_str = Column(String(30), nullable=True)
    actual_exit_time = Column(DateTime, nullable=True)
    actual_return_time = Column(DateTime, nullable=True)
    verification_time = Column(DateTime, nullable=True)
    verified_by = Column(Integer, ForeignKey('Users.user_id'), nullable=True)

    # Relationships
    gate_pass = relationship("GatePass", back_populates="activity")
    verifier = relationship("User", foreign_keys=[verified_by], back_populates="activities_verified")

class VisitorPass(Base):
    __tablename__ = 'VisitorPass'
    
    visitor_pass_id = Column(Integer, primary_key=True, autoincrement=True)
    host_user_id = Column(Integer, ForeignKey('Users.user_id'), nullable=False)
    visitor_name = Column(String(100), nullable=False)
    visitor_contact = Column(String(20), nullable=False)
    visitor_organization = Column(String(100), nullable=True)
    purpose = Column(String(300), nullable=False)
    expected_entry_time = Column(DateTime, nullable=False)
    expected_exit_time = Column(DateTime, nullable=False)
    status = Column(Enum('pending', 'approved', 'rejected', name='visitor_status_enum'), default='pending')
    request_date = Column(DateTime, nullable=False)
    approved_by = Column(Integer, ForeignKey('Users.user_id'), nullable=True)
    approved_at = Column(DateTime, nullable=True)

    # Relationships
    host = relationship("User", foreign_keys=[host_user_id], backref="visitor_passes_hosted")
    approver = relationship("User", foreign_keys=[approved_by], backref="visitor_passes_approved")

    def to_dict(self):
        return {
            "visitor_pass_id": f"VP-2025-{self.visitor_pass_id:04d}",
            "host_name": self.host.name if self.host else "—",
            "visitor_name": self.visitor_name,
            "visitor_contact": self.visitor_contact,
            "visitor_organization": self.visitor_organization,
            "purpose": self.purpose,
            "expected_entry_time": self.expected_entry_time.isoformat() if self.expected_entry_time else None,
            "expected_exit_time": self.expected_exit_time.isoformat() if self.expected_exit_time else None,
            "status": self.status,
            "request_date": self.request_date.isoformat() if self.request_date else None,
            "approved_by": self.approver.name if self.approver else "—",
            "approved_at": self.approved_at.isoformat() if self.approved_at else None
        }

class MaterialPass(Base):
    __tablename__ = 'MaterialPass'
    
    material_pass_id = Column(Integer, primary_key=True, autoincrement=True)
    requested_by = Column(Integer, ForeignKey('Users.user_id'), nullable=False)
    material_description = Column(Text, nullable=False)
    quantity = Column(String(100), nullable=False)
    movement_direction = Column(Enum('inward', 'outward', name='movement_direction_enum'), nullable=False)
    vehicle_involved = Column(Boolean, nullable=False, default=False)
    vehicle_number = Column(String(50), nullable=True)
    purpose = Column(String(300), nullable=False)
    expected_movement_time = Column(DateTime, nullable=False)
    status = Column(Enum('pending', 'approved', 'rejected', name='material_status_enum'), default='pending')
    request_date = Column(DateTime, nullable=False)
    approved_by = Column(Integer, ForeignKey('Users.user_id'), nullable=True)
    approved_at = Column(DateTime, nullable=True)

    # Relationships
    host = relationship("User", foreign_keys=[requested_by], backref="material_passes_requested")
    approver = relationship("User", foreign_keys=[approved_by], backref="material_passes_approved")

    def to_dict(self):
        return {
            "material_pass_id": f"MP-2025-{self.material_pass_id:04d}",
            "host_name": self.host.name if self.host else "—",
            "material_description": self.material_description,
            "quantity": self.quantity,
            "movement_direction": self.movement_direction,
            "vehicle_involved": self.vehicle_involved,
            "vehicle_number": self.vehicle_number,
            "purpose": self.purpose,
            "expected_movement_time": self.expected_movement_time.isoformat() if self.expected_movement_time else None,
            "status": self.status,
            "request_date": self.request_date.isoformat() if self.request_date else None,
            "approved_by": self.approver.name if self.approver else "—",
            "approved_at": self.approved_at.isoformat() if self.approved_at else None
        }
