from fastapi import APIRouter

router = APIRouter(prefix="/alerts", tags=["Alerts"])

@router.get("/")
def test_alerts():
    return {"message": "Alerts route working"}