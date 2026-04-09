"""
Simulation Engine — FactoryPulse
==================================
The core runtime that models a production line in real time.

Architecture:
  - SimulationEngine is a singleton managing all machine states
  - A background asyncio task calls `tick()` every TICK_INTERVAL seconds
  - Each tick updates every machine's process variables based on its status
  - Random faults are injected probabilistically
  - Alarms are generated and stored in a rolling buffer
  - Operator control actions are applied between ticks

This mirrors how a real PLC works:
  1. Read inputs (we skip this — no real I/O)
  2. Execute logic (our tick function)
  3. Write outputs (we update the state objects)
  4. Repeat

The engine exposes thread-safe methods so the FastAPI routes
can read state and issue commands without race conditions.
"""

from __future__ import annotations

import asyncio
import random
import time
import logging
from typing import Optional

from backend.models.machine import (
    MachineDefinition,
    MachineState,
    MachineStatus,
    FaultInfo,
    AlarmRecord,
    SystemSummary,
)
from backend.core.fault_catalog import FAULT_CATALOG
from backend.core.plant_config import PRODUCTION_LINE

logger = logging.getLogger("factorypulse.engine")

# ─── Configuration ────────────────────────────────────────────────────

TICK_INTERVAL: float = 1.0          # seconds between simulation cycles
MAX_ALARM_HISTORY: int = 200        # rolling buffer size
TEMP_CEILING: float = 95.0          # max temperature before guaranteed fault
TEMP_WARNING: float = 75.0          # HMI shows warning above this


# ─── Simulation Engine ────────────────────────────────────────────────

class SimulationEngine:
    """Manages the full simulation lifecycle for all machines."""

    def __init__(self, definitions: list[MachineDefinition] | None = None):
        defs = definitions or PRODUCTION_LINE
        self.machines: dict[str, MachineState] = {}
        for d in defs:
            self.machines[d.id] = MachineState(
                id=d.id,
                name=d.name,
                icon=d.icon,
                temperature=d.base_temp + random.uniform(-1, 3),
                base_temp=d.base_temp,
                base_power=d.base_power,
                output_rate=d.output_rate,
                fault_probability=d.fault_probability,
            )

        self.alarms: list[AlarmRecord] = []
        self.tick_count: int = 0
        self._running: bool = False
        self._task: Optional[asyncio.Task] = None

    # ── Lifecycle ─────────────────────────────────────────────────────

    async def start(self):
        """Start the background simulation loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("Simulation engine STARTED — tick interval %.1fs", TICK_INTERVAL)

    async def stop(self):
        """Gracefully stop the simulation loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Simulation engine STOPPED at tick %d", self.tick_count)

    async def _loop(self):
        """Main simulation loop — runs until stopped."""
        while self._running:
            self.tick()
            await asyncio.sleep(TICK_INTERVAL)

    # ── Core Tick Logic ───────────────────────────────────────────────

    def tick(self):
        """Execute one simulation cycle across all machines.

        This is the equivalent of one PLC scan cycle:
          1. For each machine, compute new process variables
          2. Check for fault conditions
          3. Update timestamps and counters
        """
        self.tick_count += 1
        now = time.time()

        for mid, m in self.machines.items():
            if m.status == MachineStatus.RUNNING:
                self._tick_running(m, now)
            elif m.status == MachineStatus.IDLE:
                self._tick_idle(m, now)
            elif m.status == MachineStatus.FAULT:
                self._tick_fault(m, now)
            elif m.status == MachineStatus.MAINTENANCE:
                self._tick_maintenance(m, now)

            m.last_updated = now

    def _tick_running(self, m: MachineState, now: float):
        """Update a machine that is actively producing."""
        m.uptime_seconds += 1

        # Output: probabilistic production
        if random.random() < 0.7:
            m.output_count += max(1, int(
                m.output_rate * random.uniform(0.8, 1.4) / 10
            ))

        # Temperature: trends upward with noise
        m.temperature = min(
            TEMP_CEILING,
            m.temperature + random.uniform(-0.3, 1.2)
        )

        # Power: fluctuates around base rating
        m.power_usage = m.base_power * random.uniform(0.85, 1.3)

        # Utilization: climbs toward 100%
        m.utilization = min(100.0, m.utilization + random.uniform(-0.5, 3.0))

        # Fault injection: random chance each tick
        if random.random() < m.fault_probability:
            self._inject_fault(m, now)
        # Also fault if temperature exceeds ceiling
        elif m.temperature >= TEMP_CEILING:
            self._inject_fault(m, now, fault=FAULT_CATALOG[0])  # Overtemp

    def _tick_idle(self, m: MachineState, now: float):
        """Update a machine that is powered on but not producing."""
        # Temperature: cools toward ambient
        m.temperature = max(
            m.base_temp - 2,
            m.temperature - random.uniform(0, 0.8)
        )
        # Standby power
        m.power_usage = m.base_power * 0.05
        # Utilization decays
        m.utilization = max(0.0, m.utilization - 2.0)

    def _tick_fault(self, m: MachineState, now: float):
        """Update a machine in fault state — production halted."""
        m.temperature = max(
            m.base_temp,
            m.temperature - random.uniform(0, 0.3)
        )
        m.power_usage = m.base_power * 0.15
        m.utilization = 0.0

    def _tick_maintenance(self, m: MachineState, now: float):
        """Update a machine in maintenance mode."""
        m.temperature = max(
            m.base_temp - 3,
            m.temperature - random.uniform(0, 1.0)
        )
        m.power_usage = m.base_power * 0.02
        m.utilization = 0.0

    def _inject_fault(
        self,
        m: MachineState,
        now: float,
        fault: FaultInfo | None = None,
    ):
        """Transition a machine into FAULT state and log an alarm."""
        fault = fault or random.choice(FAULT_CATALOG)
        m.status = MachineStatus.FAULT
        m.fault_flag = True
        m.current_fault = fault
        m.utilization = 0.0

        alarm = AlarmRecord(
            id=f"{now:.0f}-{m.id}",
            machine_id=m.id,
            machine_name=m.name,
            fault=fault,
            timestamp=now,
        )
        self.alarms.insert(0, alarm)
        # Trim alarm buffer
        if len(self.alarms) > MAX_ALARM_HISTORY:
            self.alarms = self.alarms[:MAX_ALARM_HISTORY]

        logger.warning(
            "FAULT on %s: %s — %s", m.name, fault.code, fault.description
        )

    # ── Operator Controls ─────────────────────────────────────────────

    def start_machine(self, machine_id: str) -> tuple[bool, str]:
        """Operator START command — transitions IDLE → RUNNING."""
        m = self.machines.get(machine_id)
        if not m:
            return False, f"Machine {machine_id} not found"
        if m.status != MachineStatus.IDLE:
            return False, f"Cannot start: machine is {m.status.value}"
        m.status = MachineStatus.RUNNING
        logger.info("Operator START: %s", m.name)
        return True, f"{m.name} started"

    def stop_machine(self, machine_id: str) -> tuple[bool, str]:
        """Operator STOP command — transitions RUNNING → IDLE."""
        m = self.machines.get(machine_id)
        if not m:
            return False, f"Machine {machine_id} not found"
        if m.status != MachineStatus.RUNNING:
            return False, f"Cannot stop: machine is {m.status.value}"
        m.status = MachineStatus.IDLE
        m.utilization = 0.0
        logger.info("Operator STOP: %s", m.name)
        return True, f"{m.name} stopped"

    def reset_machine(self, machine_id: str) -> tuple[bool, str]:
        """Operator RESET command — clears fault, transitions FAULT → IDLE."""
        m = self.machines.get(machine_id)
        if not m:
            return False, f"Machine {machine_id} not found"
        if m.status != MachineStatus.FAULT:
            return False, f"Cannot reset: machine is {m.status.value}"
        m.status = MachineStatus.IDLE
        m.fault_flag = False
        m.current_fault = None
        m.utilization = 0.0
        logger.info("Operator RESET: %s", m.name)
        return True, f"{m.name} fault cleared"

    def set_maintenance(self, machine_id: str) -> tuple[bool, str]:
        """Operator MAINTENANCE command — any state → MAINTENANCE."""
        m = self.machines.get(machine_id)
        if not m:
            return False, f"Machine {machine_id} not found"
        if m.status == MachineStatus.MAINTENANCE:
            return False, "Already in maintenance"
        m.status = MachineStatus.MAINTENANCE
        m.maintenance_flag = True
        m.fault_flag = False
        m.current_fault = None
        m.utilization = 0.0
        logger.info("Operator MAINTENANCE: %s", m.name)
        return True, f"{m.name} entered maintenance mode"

    def clear_maintenance(self, machine_id: str) -> tuple[bool, str]:
        """Operator CLEAR MAINTENANCE — MAINTENANCE → IDLE."""
        m = self.machines.get(machine_id)
        if not m:
            return False, f"Machine {machine_id} not found"
        if m.status != MachineStatus.MAINTENANCE:
            return False, f"Not in maintenance: machine is {m.status.value}"
        m.status = MachineStatus.IDLE
        m.maintenance_flag = False
        logger.info("Operator CLEAR MAINT: %s", m.name)
        return True, f"{m.name} maintenance complete"

    def emergency_stop(self) -> str:
        """E-STOP — immediately halts ALL machines."""
        for m in self.machines.values():
            m.status = MachineStatus.IDLE
            m.utilization = 0.0

        now = time.time()
        alarm = AlarmRecord(
            id=f"{now:.0f}-ESTOP",
            machine_id="SYSTEM",
            machine_name="ALL MACHINES",
            fault=FaultInfo(
                code="E-STOP",
                description="Emergency stop activated by operator",
                severity="critical",
            ),
            timestamp=now,
        )
        self.alarms.insert(0, alarm)
        logger.critical("EMERGENCY STOP activated")
        return "Emergency stop executed — all machines halted"

    def start_all(self) -> str:
        """Start all idle machines."""
        started = []
        for m in self.machines.values():
            if m.status == MachineStatus.IDLE:
                m.status = MachineStatus.RUNNING
                started.append(m.name)
        logger.info("START ALL: %s", started)
        return f"Started: {', '.join(started)}" if started else "No idle machines to start"

    # ── Alarm Management ──────────────────────────────────────────────

    def acknowledge_alarm(self, alarm_id: str) -> bool:
        """Mark an alarm as acknowledged by the operator."""
        for a in self.alarms:
            if a.id == alarm_id:
                a.acknowledged = True
                return True
        return False

    def acknowledge_all_alarms(self) -> int:
        """Acknowledge all unacknowledged alarms."""
        count = 0
        for a in self.alarms:
            if not a.acknowledged:
                a.acknowledged = True
                count += 1
        return count

    def clear_acknowledged_alarms(self) -> int:
        """Remove all acknowledged alarms from history."""
        before = len(self.alarms)
        self.alarms = [a for a in self.alarms if not a.acknowledged]
        return before - len(self.alarms)

    # ── Read Methods ──────────────────────────────────────────────────

    def get_all_machines(self) -> list[MachineState]:
        """Return a snapshot of all machine states."""
        return list(self.machines.values())

    def get_machine(self, machine_id: str) -> MachineState | None:
        """Return a single machine state."""
        return self.machines.get(machine_id)

    def get_summary(self) -> SystemSummary:
        """Compute aggregate plant metrics."""
        machines = list(self.machines.values())
        running = [m for m in machines if m.status == MachineStatus.RUNNING]
        faults = [m for m in machines if m.fault_flag]
        unack = [a for a in self.alarms if not a.acknowledged]

        return SystemSummary(
            total_output=sum(m.output_count for m in machines),
            running_count=len(running),
            total_machines=len(machines),
            total_power_kw=round(sum(m.power_usage for m in machines), 2),
            average_utilization=round(
                sum(m.utilization for m in machines) / max(len(machines), 1), 1
            ),
            active_faults=len(faults),
            unacknowledged_alarms=len(unack),
            simulation_tick=self.tick_count,
        )

    def get_alarms(
        self,
        limit: int = 50,
        unacknowledged_only: bool = False,
    ) -> list[AlarmRecord]:
        """Return alarm history with optional filtering."""
        alarms = self.alarms
        if unacknowledged_only:
            alarms = [a for a in alarms if not a.acknowledged]
        return alarms[:limit]
