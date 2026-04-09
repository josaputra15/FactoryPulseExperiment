"""
Machine Models — FactoryPulse
==============================
Defines the data structures for simulated production-line machines.

In a real HMI/SCADA system, these would map to PLC registers or OPC-UA tags.
Here, they represent the same concepts in software:
  - Machine identity and status
  - Process variables (temperature, power, utilization)
  - Production counters (output count)
  - Fault and maintenance flags
  - Timestamps for audit logging
"""

from __future__ import annotations

import time
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ─── Enumerations ─────────────────────────────────────────────────────

class MachineStatus(str, Enum):
    """Possible operational states for a machine.

    Maps to standard HMI state conventions:
      RUNNING     → machine actively producing
      IDLE        → powered on, not producing
      FAULT       → error detected, production halted
      MAINTENANCE → operator-initiated service mode
    """
    RUNNING = "running"
    IDLE = "idle"
    FAULT = "fault"
    MAINTENANCE = "maintenance"


class FaultSeverity(str, Enum):
    """Alarm priority levels, mirroring ISA-18.2 alarm management."""
    WARNING = "warning"
    CRITICAL = "critical"


# ─── Fault / Alarm Model ─────────────────────────────────────────────

class FaultInfo(BaseModel):
    """Represents a specific fault condition on a machine."""
    code: str = Field(..., description="Fault code, e.g. F-101")
    description: str = Field(..., description="Human-readable fault description")
    severity: FaultSeverity = FaultSeverity.WARNING


class AlarmRecord(BaseModel):
    """A timestamped alarm entry for the alarm log.

    In real SCADA, alarms are persisted to a historian database.
    We keep them in-memory for this simulation.
    """
    id: str
    machine_id: str
    machine_name: str
    fault: FaultInfo
    timestamp: float = Field(default_factory=time.time)
    acknowledged: bool = False


# ─── Machine Definition (static config) ──────────────────────────────

class MachineDefinition(BaseModel):
    """Static configuration for a machine type.

    This is the "blueprint" — it doesn't change at runtime.
    Think of it as the engineering datasheet for the equipment.
    """
    id: str
    name: str
    icon: str
    base_temp: float = Field(..., description="Ambient/idle temperature in °C")
    base_power: float = Field(..., description="Rated power draw in kW")
    output_rate: int = Field(..., description="Max units per cycle at full speed")
    fault_probability: float = Field(
        ..., ge=0, le=1,
        description="Per-tick probability of a random fault (0–1)"
    )


# ─── Live Machine State (runtime) ────────────────────────────────────

class MachineState(BaseModel):
    """The live, mutable state of a machine at any point in time.

    This is what the HMI screen reads and displays to the operator.
    Updated every simulation tick (1 second).
    """
    # Identity (from definition)
    id: str
    name: str
    icon: str

    # Operational state
    status: MachineStatus = MachineStatus.IDLE

    # Process variables
    temperature: float = Field(0.0, description="Current temp in °C")
    power_usage: float = Field(0.0, description="Current power draw in kW")
    utilization: float = Field(0.0, description="Current utilization 0–100%")

    # Production counter
    output_count: int = Field(0, description="Total units produced")

    # Fault tracking
    fault_flag: bool = False
    current_fault: Optional[FaultInfo] = None

    # Maintenance tracking
    maintenance_flag: bool = False

    # Timing
    uptime_seconds: int = Field(0, description="Seconds in RUNNING state")
    last_updated: float = Field(default_factory=time.time)

    # Config reference (carried forward for simulation math)
    base_temp: float = 35.0
    base_power: float = 2.0
    output_rate: int = 10
    fault_probability: float = 0.01


# ─── API Response Models ─────────────────────────────────────────────

class SystemSummary(BaseModel):
    """Aggregated metrics across all machines — the "plant overview" panel."""
    total_output: int
    running_count: int
    total_machines: int
    total_power_kw: float
    average_utilization: float
    active_faults: int
    unacknowledged_alarms: int
    simulation_tick: int
    timestamp: float = Field(default_factory=time.time)


class ControlRequest(BaseModel):
    """Payload for operator control actions."""
    machine_id: str
    action: str = Field(
        ...,
        description="One of: start, stop, reset, maintenance, clear_maintenance"
    )


class ControlResponse(BaseModel):
    """Response after a control action."""
    success: bool
    machine_id: str
    action: str
    new_status: MachineStatus
    message: str
