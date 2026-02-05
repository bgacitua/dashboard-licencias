from pydantic import BaseModel
from datetime import date
from typing import Optional, List, Union

class VacacionBase(BaseModel):
    employee_id: int
    full_name: str
    rut: Optional[str]
    working_days: int
    calendar_days: int
    workday_stage: str
    type: str
    status: str
    start_date: date
    end_date: date

