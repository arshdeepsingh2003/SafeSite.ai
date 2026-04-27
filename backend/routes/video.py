from fastapi import APIRouter

router = APIRouter(prefix="/video", tags=["Video"])

@router.get("/")
def test_video():
    return {"message": "Video route working"}