from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router

app = FastAPI(
    title="Reflection AI Assessment System - Backend API",
    description="Document extraction, deterministic keyword scoring, and report generation service.",
    version="1.0.0"
)

# CORS setup for both Next.js portals
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to Vercel portal domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
