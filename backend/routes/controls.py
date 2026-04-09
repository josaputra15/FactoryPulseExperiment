"""
Control Routes — FactoryPulse API
====================================
Write endpoints for operator actions on machines.

In HMI/SCADA terms, these are "command" operations — the operator
presses a button on the HMI, which sends a write to the PLC.
Here, the frontend POSTs to these routes to change machine states.

Safety note: In a real system, commands go through a permission
layer and are logged to an audit trail. Our simulation logs to
the Python logger for the same spirit.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.models.machine import ControlResponse

router = APIRouter(prefix="/api/controls", tags=["controls"])

_engine = None


def set_engine(engine):
    global _engine
    _engine = engine


class MachineAction(BaseModel):
    """Request body for single-machine control actions."""
    machine_id: str


# ─── Individual Machine Controls ──────────────────────────────────────

@router.post(
    "/start",
    response_model=ControlResponse,
    summary="Start a machine",
    description="Transitions an IDLE machine to RUNNING state.",
)
async def start_machine(body: MachineAction):
    success, msg = _engine.start_machine(body.machine_id)
    m = _engine.get_machine(body.machine_id)
    if not m:
        raise HTTPException(status_code=404, detail=msg)
    return ControlResponse(
        success=success,
        machine_id=body.machine_id,
        action="start",
        new_status=m.status,
        message=msg,
    )


@router.post(
    "/stop",
    response_model=ControlResponse,
    summary="Stop a machine",
    description="Transitions a RUNNING machine to IDLE state.",
)
async def stop_machine(body: MachineAction):
    success, msg = _engine.stop_machine(body.machine_id)
    m = _engine.get_machine(body.machine_id)
    if not m:
        raise HTTPException(status_code=404, detail=msg)
    return ControlResponse(
        success=success,
        machine_id=body.machine_id,
        action="stop",
        new_status=m.status,
        message=msg,
    )


@router.post(
    "/reset",
    response_model=ControlResponse,
    summary="Reset a faulted machine",
    description="Clears the fault and transitions FAULT → IDLE.",
)
async def reset_machine(body: MachineAction):
    success, msg = _engine.reset_machine(body.machine_id)
    m = _engine.get_machine(body.machine_id)
    if not m:
        raise HTTPException(status_code=404, detail=msg)
    return ControlResponse(
        success=success,
        machine_id=body.machine_id,
        action="reset",
        new_status=m.status,
        message=msg,
    )


@router.post(
    "/maintenance",
    response_model=ControlResponse,
    summary="Enter maintenance mode",
    description="Puts any machine into MAINTENANCE state.",
)
async def set_maintenance(body: MachineAction):
    success, msg = _engine.set_maintenance(body.machine_id)
    m = _engine.get_machine(body.machine_id)
    if not m:
        raise HTTPException(status_code=404, detail=msg)
    return ControlResponse(
        success=success,
        machine_id=body.machine_id,
        action="maintenance",
        new_status=m.status,
        message=msg,
    )


@router.post(
    "/clear-maintenance",
    response_model=ControlResponse,
    summary="Clear maintenance mode",
    description="Transitions MAINTENANCE → IDLE.",
)
async def clear_maintenance(body: MachineAction):
    success, msg = _engine.clear_maintenance(body.machine_id)
    m = _engine.get_machine(body.machine_id)
    if not m:
        raise HTTPException(status_code=404, detail=msg)
    return ControlResponse(
        success=success,
        machine_id=body.machine_id,
        action="clear_maintenance",
        new_status=m.status,
        message=msg,
    )


# ─── Global Controls ─────────────────────────────────────────────────

@router.post(
    "/emergency-stop",
    summary="Emergency stop all machines",
    description="Immediately halts ALL machines and logs a system alarm.",
)
async def emergency_stop():
    msg = _engine.emergency_stop()
    return {"success": True, "action": "emergency_stop", "message": msg}


@router.post(
    "/start-all",
    summary="Start all idle machines",
    description="Transitions every IDLE machine to RUNNING.",
)
async def start_all():
    msg = _engine.start_all()
    return {"success": True, "action": "start_all", "message": msg}
