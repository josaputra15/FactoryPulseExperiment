"""
Fault Catalog — FactoryPulse
==============================
A registry of all possible fault conditions.

In real industrial systems, fault codes are defined in a PLC program
and mapped to HMI alarm tags. This catalog serves the same purpose
for our simulation — it gives each fault a code, description, and
severity so the alarm engine can reference them consistently.
"""

from backend.models.machine import FaultInfo, FaultSeverity

FAULT_CATALOG: list[FaultInfo] = [
    FaultInfo(
        code="F-101",
        description="Overtemperature limit exceeded",
        severity=FaultSeverity.CRITICAL,
    ),
    FaultInfo(
        code="F-202",
        description="Motor stall detected",
        severity=FaultSeverity.CRITICAL,
    ),
    FaultInfo(
        code="F-303",
        description="Sensor read failure",
        severity=FaultSeverity.WARNING,
    ),
    FaultInfo(
        code="F-404",
        description="Throughput below threshold",
        severity=FaultSeverity.WARNING,
    ),
    FaultInfo(
        code="F-505",
        description="Vibration anomaly detected",
        severity=FaultSeverity.CRITICAL,
    ),
    FaultInfo(
        code="F-606",
        description="Power supply fluctuation",
        severity=FaultSeverity.WARNING,
    ),
    FaultInfo(
        code="F-707",
        description="Conveyor belt misalignment",
        severity=FaultSeverity.WARNING,
    ),
    FaultInfo(
        code="F-808",
        description="Pneumatic pressure drop",
        severity=FaultSeverity.CRITICAL,
    ),
]
