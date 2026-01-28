import sys
import os
from sqlalchemy import text

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.db.session import engine

def update_schema():
    with engine.connect() as conn:
        print("Updating schema...")
        try:
            # Check if column exists first to avoid error spam, or just try/except
            conn.execute(text("ALTER TABLE finiquitos ADD causal VARCHAR(255) NULL"))
            print("Added column 'causal'")
        except Exception as e:
            print(f"Could not add 'causal': {e}")

        try:
            conn.execute(text("ALTER TABLE finiquitos ADD vacaciones_pendientes FLOAT NULL"))
            print("Added column 'vacaciones_pendientes'")
        except Exception as e:
            print(f"Could not add 'vacaciones_pendientes': {e}")
        
        conn.commit()
        print("Schema update complete.")

if __name__ == "__main__":
    update_schema()
