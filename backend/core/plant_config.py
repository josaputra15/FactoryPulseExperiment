"""
Plant Configuration — FactoryPulse
====================================
Defines the physical machines on our simulated production line.

Layout:
  [Conveyor Belt] → [Sorting Station] → [Packaging Unit]

Each definition sets the machine's baseline characteristics:
  - base_temp:         idle temperature (ambient)
  - base_power:        nameplate power rating
  - output_rate:       max throughput per simulation cycle
  - fault_probability: likelihood of random fault per tick

In a real plant, this would come from an engineering database
or be configured in the PLC/HMI project file.
"""

from backend.models.machine import MachineDefinition

PRODUCTION_LINE: list[MachineDefinition] = [
    MachineDefinition(
        id="conv-01",
        name="Conveyor Belt",
        icon="⟹",
        base_temp=38.0,
        base_power=2.1,
        output_rate=12,
        fault_probability=0.008,
    ),
    MachineDefinition(
        id="sort-01",
        name="Sorting Station",
        icon="⇶",
        base_temp=45.0,
        base_power=3.4,
        output_rate=9,
        fault_probability=0.012,
    ),
    MachineDefinition(
        id="pack-01",
        name="Packaging Unit",
        icon="▣",
        base_temp=33.0,
        base_power=1.8,
        output_rate=7,
        fault_probability=0.006,
    ),
]
