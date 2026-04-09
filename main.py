"""
FactoryPulse — Main Application
==================================
Entry point for the FastAPI backend server.

Architecture:
  ┌──────────────────────────────────────────────────┐
  │  FastAPI Server                                  │
  │                                                  │
  │  ┌─────────────┐    ┌──────────────────────────┐ │
  │  │ API Routes   │◄──│  Simulation Engine        │ │
  │  │  /machines   │    │  (background async task)  │ │
  │  │  /controls   │    │  - ticks every 1s         │ │
  │  │  /alarms     │    │  - updates machine states │ │
  │  └─────────────┘    │  - injects faults         │ │
  │                      │  - logs alarms            │ │
  │                      └──────────────────────────┘ │
  └──────────────────────────────────────────────────┘

Run with:
    cd factorypulse
    uvicorn main:app --reload --port 8000

Then open:
    http://localhost:8000/docs   ← interactive Swagger UI
    http://localhost:8000/       ← health check
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.engine.simulation import SimulationEngine
from backend.routes import (
    machines_router,
    machines_set_engine,
    controls_router,
    controls_set_engine,
    alarms_router,
    alarms_set_engine,
)

# ─── Logging Setup ────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-28s │ %(levelname)-8s │ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("factorypulse")

# ─── Simulation Engine (singleton) ────────────────────────────────────

engine = SimulationEngine()

# ─── App Lifecycle ────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the simulation engine when the server boots,
    and stop it cleanly on shutdown."""
    logger.info("=" * 60)
    logger.info("  FactoryPulse HMI/SCADA Backend Starting")
    logger.info("=" * 60)
    await engine.start()
    yield
    await engine.stop()
    logger.info("FactoryPulse shutdown complete.")

# ─── FastAPI App ──────────────────────────────────────────────────────

app = FastAPI(
    title="FactoryPulse API",
    description=(
        "Real-time HMI/SCADA simulation backend. "
        "Simulates a 3-machine production line with live state updates, "
        "fault injection, alarm management, and operator controls."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the frontend to connect from any origin during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Wire Engine into Routes ─────────────────────────────────────────

machines_set_engine(engine)
controls_set_engine(engine)
alarms_set_engine(engine)

app.include_router(machines_router)
app.include_router(controls_router)
app.include_router(alarms_router)

# ─── Root / Health Check ──────────────────────────────────────────────

@app.get("/", tags=["health"])
async def root():
    summary = engine.get_summary()
    return {
        "service": "FactoryPulse",
        "status": "online",
        "simulation_tick": summary.simulation_tick,
        "machines_running": summary.running_count,
        "total_output": summary.total_output,
        "active_faults": summary.active_faults,
    }
