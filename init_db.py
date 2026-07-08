import os
import pymysql
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash
import database
from database import Base, User, GatePass, GateActivity, init_engine

from datetime import date, datetime, timedelta

load_dotenv()

DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_USER = os.getenv('DB_USER', 'root')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')
DB_NAME = os.getenv('DB_NAME', 'igps_db')

def create_database():
    # Connect without specifying database to create it if it doesn't exist
    conn = pymysql.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD)
    cursor = conn.cursor()
    cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
    conn.commit()
    cursor.close()
    conn.close()
    print(f"[*] Database '{DB_NAME}' ensured.")

def seed_data():
    db = database.SessionLocal()
    try:
        # Drop and recreate to update the ENUM
        database.Base.metadata.drop_all(bind=database.engine)
        database.Base.metadata.create_all(bind=database.engine)
        
        # Seed Users
        users = [
            User(name="Rahul Employee", email="employee@nlcindia.com", password=generate_password_hash("password123"), role="employee", department="Mechanical Engineering"),
            User(name="Muthu Security", email="security@nlcindia.com", password=generate_password_hash("password123"), role="security", department="Security Division"),
            User(name="Admin User", email="admin@nlcindia.com", password=generate_password_hash("password123"), role="admin", department="Administration"),
            User(name="Priya Manager", email="manager@nlcindia.com", password=generate_password_hash("password123"), role="manager", department="Electrical Engineering")
        ]
        db.add_all(users)
        db.commit()

        # Fetch inserted users to use their IDs
        employee = db.query(User).filter_by(role="employee").first()
        admin = db.query(User).filter_by(role="admin").first()

        # Seed some dummy GatePasses
        passes = [
            GatePass(
                user_id=employee.user_id,
                reason="Medical appointment",
                request_date=date.today(),
                exit_time=datetime.now() + timedelta(hours=1),
                return_time=datetime.now() + timedelta(hours=5),
                status="approved",
                approved_by=admin.user_id
            )
        ]
        db.add_all(passes)
        db.commit()

        print("[*] Database seeded successfully with 4 test users and 1 gate pass.")
        print("Test Accounts (Password: password123):")
        print("  - employee@nlcindia.com")
        print("  - security@nlcindia.com")
        print("  - admin@nlcindia.com")
        print("  - manager@nlcindia.com")

    except Exception as e:
        print(f"[!] Error seeding data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    print("[IGPS] Initializing database...")
    create_database()
    init_engine()
    Base.metadata.create_all(bind=database.engine)
    print("[*] Tables created.")
    seed_data()
    print("[IGPS] Database setup complete.")
