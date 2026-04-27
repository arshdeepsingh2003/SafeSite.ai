from fastapi import APIRouter

router = APIRouter(prefix="/test", tags=["Test"])

@router.get("/")
def test_socket():
    return {"message": "Socket test route working"}
