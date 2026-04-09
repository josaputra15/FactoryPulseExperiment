"""
Machine Routes — FactoryPulse API
====================================
Read-only endpoints for querying machine states and system metrics.

In HMI/SCADA terms, these are the "tag read" operations — the
dashboard polls these to display live data to the operator.
"""

from fastapi import APIRouter, HTTPException

from backend.models.machine import MachineState, SystemSummary

router = APIRouter(prefix="/api/machines", tags=["machines"])

# The engine reference is injected at startup (see main.py)
_engine = None


def set_engine(engine):
    global _engine
    _engine = engine


@router.get(
    "/",
    response_model=list[MachineState],
    summary="Get all machine states",
    description="Returns the live state of every machine on the production line.",
)
async def get_all_machines():
    return _engine.get_all_machines()


@router.get(
    "/{machine_id}",
    response_model=MachineState,
    summary="Get a single machine",
    description="Returns the live state of a specific machine by ID.",
)
async def get_machine(machine_id: str):
    machine = _engine.get_machine(machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail=f"Machine '{machine_id}' not found")
    return machine


@router.get(
    "/summary/overview",
    response_model=SystemSummary,
    summary="Get system summary",
    description=(
        "Returns aggregated metrics across all machines: "
        "total output, power, utilization, fault count, etc."
    ),
)
async def get_system_summary():
    return _engine.get_summary()
