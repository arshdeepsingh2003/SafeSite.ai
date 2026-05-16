from datetime import datetime, timezone, timedelta

IST = timezone(timedelta(hours=5, minutes=30))

def istnow() -> datetime:
    return datetime.now(IST)
