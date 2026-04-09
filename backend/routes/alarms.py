"""
Alarm Routes — FactoryPulse API
==================================
Endpoints for reading and managing the alarm log.

In real SCADA, the alarm system is one of the most critical
subsystems — operators must see, acknowledge, and clear alarms
to maintain safe plant operation. ISA-18.2 defines the standard
alarm lifecycle: Active → Acknowledged → Cleared.

Our simplified version follows the same flow.
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel

from backend.models.machine import AlarmRecord

router = APIRouter(prefix="/api/alarms", tags=["alarms"])

_engine = None


def set_engine(engine):
    global _engine
    _engine = engine


class AlarmAckRequest(BaseModel):
    alarm_id: str


@router.get(
    "/",
    response_model=list[AlarmRecord],
    summary="Get alarm history",
    description="Returns the alarm log, newest first.",
)
async def get_alarms(
    limit: int = Query(50, ge=1, le=200),
    unacknowledged_only: bool = Query(False),
):
    return _engine.get_alarms(limit=limit, unacknowledged_only=unacknowledged_only)


@router.post(
    "/acknowledge",
    summary="Acknowledge a single alarm",
)
async def acknowledge_alarm(body: AlarmAckRequest):
    found = _engine.acknowledge_alarm(body.alarm_id)
    return {"success": found, "alarm_id": body.alarm_id}


@router.post(
    "/acknowledge-all",
    summary="Acknowledge all active alarms",
)
async def acknowledge_all():
    count = _engine.acknowledge_all_alarms()
    return {"success": True, "acknowledged_count": count}


@router.post(
    "/clear-acknowledged",
    summary="Clear all acknowledged alarms from history",
)
async def clear_acknowledged():
    count = _engine.clear_acknowledged_alarms()
    return {"success": True, "cleared_count": count}
