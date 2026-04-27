from fastapi import APIRouter

router = APIRouter(prefix="/ai", tags=["AI"])

@router.get("/")
def test_ai():
    return {"message": "AI route working"}