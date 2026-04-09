# FactoryPulse — Mini HMI/SCADA Dashboard

> A real-time factory control dashboard that simulates a 3-machine production line with live machine states, fault injection, alarm management, and operator controls.

Built as a portfolio project to demonstrate **industrial automation thinking** from a **Computer Science** background.

---

## What This Is

FactoryPulse simulates what a real HMI (Human-Machine Interface) / SCADA (Supervisory Control and Data Acquisition) system does in a factory:

- **Monitors** machine states in real time (running, idle, fault, maintenance)
- **Displays** process variables: temperature, power usage, utilization, output count
- **Handles faults** — random failures inject into the simulation, trigger alarms
- **Provides operator controls** — start, stop, reset, maintenance, emergency stop
- **Logs alarms** with severity levels, timestamps, and acknowledge/clear workflow

### Production Line Layout

```
[Conveyor Belt] ──→ [Sorting Station] ──→ [Packaging Unit]
     conv-01              sort-01              pack-01
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React / HTML+JS)                                 │
│  ┌──────────┐ ┌──────────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Summary  │ │ Machine Cards│ │  Alarm   │ │ Controls  │  │
│  │ Metrics  │ │ + Sparklines │ │  Panel   │ │  Buttons  │  │
│  └──────────┘ └──────────────┘ └──────────┘ └───────────┘  │
│         │              │              │            │         │
│         └──── polls every 1s (GET) ──┘   POST on click ─┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / JSON
┌──────────────────────────┴──────────────────────────────────┐
│  FastAPI Backend                                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  API Routes                                         │    │
│  │  GET  /api/machines/            → all machine states│    │
│  │  GET  /api/machines/summary/overview → plant metrics│    │
│  │  GET  /api/alarms/              → alarm history     │    │
│  │  POST /api/controls/start       → start machine     │    │
│  │  POST /api/controls/stop        → stop machine      │    │
│  │  POST /api/controls/reset       → reset fault       │    │
│  │  POST /api/controls/maintenance → enter maint mode  │    │
│  │  POST /api/controls/emergency-stop → halt all       │    │
│  └───────────────────┬─────────────────────────────────┘    │
│                      │                                      │
│  ┌───────────────────┴─────────────────────────────────┐    │
│  │  Simulation Engine (async background task)          │    │
│  │  - Ticks every 1 second (like a PLC scan cycle)     │    │
│  │  - Updates temperature, power, utilization, output  │    │
│  │  - Injects random faults probabilistically          │    │
│  │  - Manages state transitions per machine            │    │
│  │  - Logs alarms to in-memory rolling buffer          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Machine State Model

Each machine tracks:

| Field            | Type    | Description                          |
|-----------------|---------|--------------------------------------|
| `id`            | string  | Unique machine identifier            |
| `name`          | string  | Human-readable name                  |
| `status`        | enum    | running / idle / fault / maintenance |
| `temperature`   | float   | Current temp in °C                   |
| `power_usage`   | float   | Current draw in kW                   |
| `utilization`   | float   | Percentage (0–100)                   |
| `output_count`  | int     | Total units produced                 |
| `fault_flag`    | bool    | Active fault?                        |
| `current_fault` | object  | Fault code + description + severity  |
| `uptime_seconds`| int     | Time spent in RUNNING state          |

### State Transitions

```
         ┌──── START ────┐
         ▼               │
       RUNNING ──FAULT──→ FAULT
         │                  │
        STOP             RESET
         │                  │
         ▼               ▼
        IDLE ◄───────────┘
         │
      MAINTENANCE
         │
    CLEAR_MAINT
         │
        IDLE
```

---

## API Reference

### Read Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/` | Health check + summary |
| GET | `/api/machines/` | All machine states |
| GET | `/api/machines/{id}` | Single machine state |
| GET | `/api/machines/summary/overview` | Aggregated plant metrics |
| GET | `/api/alarms/?limit=50&unacknowledged_only=false` | Alarm history |

### Control Endpoints

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| POST | `/api/controls/start` | `{"machine_id": "conv-01"}` | Start a machine |
| POST | `/api/controls/stop` | `{"machine_id": "conv-01"}` | Stop a machine |
| POST | `/api/controls/reset` | `{"machine_id": "conv-01"}` | Reset fault |
| POST | `/api/controls/maintenance` | `{"machine_id": "conv-01"}` | Enter maintenance |
| POST | `/api/controls/clear-maintenance` | `{"machine_id": "conv-01"}` | Exit maintenance |
| POST | `/api/controls/start-all` | — | Start all idle machines |
| POST | `/api/controls/emergency-stop` | — | E-STOP all machines |

### Alarm Endpoints

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| POST | `/api/alarms/acknowledge` | `{"alarm_id": "..."}` | Ack single alarm |
| POST | `/api/alarms/acknowledge-all` | — | Ack all alarms |
| POST | `/api/alarms/clear-acknowledged` | — | Remove ack'd alarms |

---

## Setup & Run

```bash
# Clone and install
cd factorypulse
pip install -r requirements.txt

# Start the backend
uvicorn main:app --reload --port 8000

# Open Swagger UI
open http://localhost:8000/docs
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | Python + FastAPI | Async-native, auto-generates API docs, fast to build |
| Simulation | asyncio background task | Mirrors real-time PLC scan cycle pattern |
| Data Models | Pydantic v2 | Type-safe, validates all data, generates JSON schemas |
| Frontend | React (or vanilla JS) | Polls backend, renders operator dashboard |
| API Docs | Swagger UI (built-in) | Interactive testing, professional documentation |

---

## What This Demonstrates

✅ **Real-time systems thinking** — continuous simulation loop, live state updates
✅ **Machine state modeling** — finite state machine with defined transitions
✅ **Fault/alarm handling** — ISA-18.2-inspired alarm lifecycle
✅ **Operator controls** — safe command patterns (start/stop/reset/e-stop)
✅ **Clean API design** — RESTful, documented, typed
✅ **Industrial automation concepts** — without pretending to be a PLC programmer

### What This Does NOT Claim

- This is **not** a real PLC or SCADA system
- No actual hardware I/O (optional Arduino extension available)
- No OPC-UA, Modbus, or industrial protocols
- No safety-rated logic (SIL levels, etc.)

It is an honest demonstration of how a CS student understands and can build software that supports industrial automation systems.

---

## File Structure

```
factorypulse/
├── main.py                          # FastAPI app entry point
├── requirements.txt                 # Python dependencies
├── README.md                        # This file
├── backend/
│   ├── __init__.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── machine.py               # Pydantic data models
│   ├── engine/
│   │   ├── __init__.py
│   │   └── simulation.py            # Simulation engine
│   ├── core/
│   │   ├── __init__.py
│   │   ├── fault_catalog.py         # Fault code definitions
│   │   └── plant_config.py          # Machine definitions
│   └── routes/
│       ├── __init__.py
│       ├── machines.py              # GET machine state endpoints
│       ├── controls.py              # POST operator control endpoints
│       └── alarms.py                # Alarm management endpoints
└── frontend/                        # Dashboard (React or HTML+JS)
```
