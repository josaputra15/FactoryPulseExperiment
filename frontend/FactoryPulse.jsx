import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = "http://localhost:8000";

async function api(path, method = "GET", body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const API = {
  getMachines: () => api("/api/machines/"),
  getSummary: () => api("/api/machines/summary/overview"),
  getAlarms: (limit = 60) => api(`/api/alarms/?limit=${limit}`),
  startMachine: (id) => api("/api/controls/start", "POST", { machine_id: id }),
  stopMachine: (id) => api("/api/controls/stop", "POST", { machine_id: id }),
  resetMachine: (id) => api("/api/controls/reset", "POST", { machine_id: id }),
  setMaintenance: (id) => api("/api/controls/maintenance", "POST", { machine_id: id }),
  clearMaintenance: (id) => api("/api/controls/clear-maintenance", "POST", { machine_id: id }),
  emergencyStop: () => api("/api/controls/emergency-stop", "POST"),
  startAll: () => api("/api/controls/start-all", "POST"),
  ackAlarm: (id) => api("/api/alarms/acknowledge", "POST", { alarm_id: id }),
  ackAll: () => api("/api/alarms/acknowledge-all", "POST"),
  clearAcked: () => api("/api/alarms/clear-acknowledged", "POST"),
};

function Sparkline({ data, color, height = 34, width = 120 }) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  });
  const gradId = `sg-${color.replace("#", "")}`;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M${pts.join(" L")}`} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d={`M${pts[0]} ${pts.join(" L")} L${width},${height} L0,${height} Z`} fill={`url(#${gradId})`} />
    </svg>
  );
}

const STATUS_COLORS = {
  running: "#00e676",
  idle: "#607d8b",
  fault: "#ff1744",
  maintenance: "#ffab00",
};
const statusColor = (s) => STATUS_COLORS[s] || "#546e7a";
const sevColor = (s) => (s === "critical" ? "#ff1744" : "#ffab00");

function GaugeRing({ value, max = 100, color, size = 48, strokeWidth = 4 }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1a2332" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
    </svg>
  );
}

function CtrlBtn({ onClick, color, label, disabled, wide }) {
  const [pressed, setPressed] = useState(false);
  const handleClick = async () => {
    setPressed(true);
    try {
      await onClick();
    } catch (e) {
      console.error(e);
    }
    setTimeout(() => setPressed(false), 300);
  };
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      style={{
        background: pressed ? `${color}33` : `${color}11`,
        border: `1px solid ${color}${disabled ? "44" : ""}`,
        color: disabled ? `${color}66` : color,
        padding: wide ? "6px 18px" : "5px 13px",
        borderRadius: 4,
        fontSize: 9,
        cursor: disabled ? "default" : "pointer",
        letterSpacing: 1.2,
        textTransform: "uppercase",
        fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
        fontWeight: 600,
        transition: "all 0.15s",
        whiteSpace: "nowrap",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
}

function ConnBadge({ status }) {
  const colors = { connected: "#00e676", connecting: "#ffab00", disconnected: "#ff1744" };
  const labels = { connected: "LIVE", connecting: "CONNECTING", disconnected: "OFFLINE" };
  const c = colors[status];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: c,
          boxShadow: `0 0 8px ${c}`,
          animation: status === "connected" ? "pulse 2.5s infinite" : "none",
        }}
      />
      <span style={{ fontSize: 9, color: c, letterSpacing: 1.5, fontWeight: 600 }}>{labels[status]}</span>
    </div>
  );
}

export default function FactoryPulse() {
  const [machines, setMachines] = useState([]);
  const [summary, setSummary] = useState(null);
  const [alarms, setAlarms] = useState([]);
  const [connStatus, setConnStatus] = useState("connecting");
  const [eStopFlash, setEStopFlash] = useState(false);
  const [view, setView] = useState("dashboard");
  const [pollCount, setPollCount] = useState(0);

  const tempHistRef = useRef({});
  const powerHistRef = useRef({});
  const [, setHistTick] = useState(0);

  useEffect(() => {
    let alive = true;
    let fails = 0;

    const poll = async () => {
      try {
        const [m, s, a] = await Promise.all([API.getMachines(), API.getSummary(), API.getAlarms(60)]);
        if (!alive) return;

        setMachines(m);
        setSummary(s);
        setAlarms(a);
        setConnStatus("connected");
        setPollCount((c) => c + 1);
        fails = 0;

        m.forEach((machine) => {
          const id = machine.id;
          if (!tempHistRef.current[id]) tempHistRef.current[id] = [];
          if (!powerHistRef.current[id]) powerHistRef.current[id] = [];
          tempHistRef.current[id] = [...tempHistRef.current[id].slice(-39), machine.temperature];
          powerHistRef.current[id] = [...powerHistRef.current[id].slice(-39), machine.power_usage];
        });
        setHistTick((t) => t + 1);
      } catch (e) {
        fails += 1;
        if (!alive) return;
        setConnStatus(fails > 3 ? "disconnected" : "connecting");
      }
    };

    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const doControl = useCallback(async (fn) => {
    try {
      await fn();
    } catch (e) {
      console.error("Control error:", e);
    }
  }, []);

  const handleEStop = useCallback(async () => {
    setEStopFlash(true);
    await doControl(API.emergencyStop);
    setTimeout(() => setEStopFlash(false), 2500);
  }, [doControl]);

  const unackCount = alarms.filter((a) => !a.acknowledged).length;
  const sm = summary || {
    total_output: 0,
    running_count: 0,
    total_machines: 0,
    total_power_kw: 0,
    average_utilization: 0,
    active_faults: 0,
    unacknowledged_alarms: 0,
    simulation_tick: 0,
  };

  if (connStatus === "disconnected" && machines.length === 0) {
    return (
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          background: "#080c12",
          color: "#c5cdd9",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            border: "2px solid #ff174444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#1a080c",
          }}
        >
          <span style={{ fontSize: 32, color: "#ff1744" }}>⚠</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#ff1744", letterSpacing: 3 }}>BACKEND OFFLINE</div>
        <div style={{ fontSize: 11, color: "#3a4a5c", maxWidth: 400, textAlign: "center", lineHeight: 1.8 }}>
          Cannot reach the FactoryPulse backend at
          <br />
          <span style={{ color: "#42a5f5", fontWeight: 600 }}>{API_BASE}</span>
        </div>
        <div
          style={{
            background: "#0d1219",
            border: "1px solid #141c27",
            borderRadius: 8,
            padding: "16px 24px",
            fontSize: 12,
            color: "#00e676",
            letterSpacing: 0.5,
            textAlign: "center",
            lineHeight: 1.8,
          }}
        >
          <span style={{ color: "#3a4a5c" }}>$</span> uvicorn main:app --reload --port 8000
        </div>
        <div style={{ fontSize: 9, color: "#1e2a38", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ffab00", animation: "pulse 1.5s infinite" }} />
          Retrying every second...
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', 'Fira Code', monospace", background: "#080c12", color: "#c5cdd9", minHeight: "100vh" }}>
      <header
        style={{
          background: "linear-gradient(180deg, #0d1219 0%, #0a0e14 100%)",
          borderBottom: "1px solid #141c27",
          padding: "0 20px",
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <ConnBadge status={connStatus} />
          <div style={{ width: 1, height: 20, background: "#1a2332" }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#e8edf3", letterSpacing: 3 }}>
            FACTORY<span style={{ color: "#00e676" }}>PULSE</span>
          </span>
          <span style={{ fontSize: 8, color: "#3a4a5c", letterSpacing: 1.5, border: "1px solid #1a2332", borderRadius: 3, padding: "2px 6px" }}>
            HMI v1.0
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", gap: 2, background: "#0d1219", borderRadius: 5, padding: 2 }}>
            {[
              { key: "dashboard", label: "OVERVIEW", icon: "◫" },
              { key: "alarms", label: "ALARMS", icon: "⚠", badge: unackCount },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                style={{
                  background: view === tab.key ? "#141c27" : "transparent",
                  border: "none",
                  color: view === tab.key ? "#e8edf3" : "#3a4a5c",
                  padding: "5px 14px",
                  borderRadius: 4,
                  fontSize: 9,
                  cursor: "pointer",
                  letterSpacing: 1.2,
                  fontFamily: "inherit",
                  fontWeight: view === tab.key ? 600 : 400,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span>{tab.icon}</span>
                {tab.label}
                {tab.badge > 0 && (
                  <span
                    style={{
                      background: "#ff1744",
                      color: "#fff",
                      fontSize: 8,
                      borderRadius: 8,
                      padding: "1px 5px",
                      fontWeight: 700,
                      minWidth: 16,
                      textAlign: "center",
                    }}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: "#1a2332" }} />
          <span style={{ fontSize: 9, color: "#3a4a5c", letterSpacing: 1 }}>TICK {sm.simulation_tick}</span>
          <span style={{ fontSize: 9, color: "#3a4a5c" }}>{new Date().toLocaleTimeString()}</span>
        </div>
      </header>

      <main style={{ padding: "16px 20px", maxWidth: 1400, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 8, marginBottom: 14 }}>
          {[
            { label: "TOTAL OUTPUT", val: sm.total_output.toLocaleString(), sub: "units produced", color: "#00e676", icon: "▦" },
            { label: "RUNNING", val: `${sm.running_count}/${sm.total_machines}`, sub: "machines active", color: sm.running_count === sm.total_machines ? "#00e676" : "#ffab00", icon: "●" },
            { label: "POWER DRAW", val: `${sm.total_power_kw.toFixed(1)}`, sub: "kilowatts", color: "#42a5f5", icon: "⚡" },
            { label: "AVG UTILIZATION", val: `${sm.average_utilization.toFixed(0)}%`, sub: "", color: sm.average_utilization > 60 ? "#00e676" : "#ffab00", icon: "◔" },
            { label: "ACTIVE FAULTS", val: sm.active_faults, sub: "", color: sm.active_faults > 0 ? "#ff1744" : "#00e676", icon: "⬤" },
            { label: "ALARMS", val: unackCount, sub: "unacknowledged", color: unackCount > 0 ? "#ff1744" : "#00e676", icon: "⚠" },
          ].map((m, i) => (
            <div key={i} style={{ background: "#0d1219", border: "1px solid #141c27", borderRadius: 6, padding: "12px 14px", borderLeft: `3px solid ${m.color}22` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 8, color: "#3a4a5c", letterSpacing: 1.8, marginBottom: 6 }}>{m.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: m.color, lineHeight: 1 }}>{m.val}</div>
                  {m.sub && <div style={{ fontSize: 8, color: "#2a3646", marginTop: 3 }}>{m.sub}</div>}
                </div>
                <span style={{ fontSize: 16, color: `${m.color}33`, marginTop: 2 }}>{m.icon}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <CtrlBtn onClick={() => doControl(API.startAll)} color="#00e676" label="▶ START ALL" wide />
          <button
            onClick={handleEStop}
            style={{
              background: eStopFlash ? "#ff1744" : "#1a0508",
              border: "2px solid #ff1744",
              color: eStopFlash ? "#fff" : "#ff1744",
              padding: "6px 20px",
              borderRadius: 4,
              fontSize: 10,
              cursor: "pointer",
              letterSpacing: 1.5,
              textTransform: "uppercase",
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 700,
              animation: eStopFlash ? "estopFlash 0.25s infinite" : "none",
              boxShadow: eStopFlash ? "0 0 24px rgba(255,23,68,0.5)" : "none",
              transition: "box-shadow 0.3s",
            }}
          >
            ⬤ EMERGENCY STOP
          </button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 8, color: "#2a3646", letterSpacing: 1 }}>
            POLL #{pollCount} • {connStatus === "connected" ? "1s interval" : "reconnecting..."}
          </span>
        </div>

        {view === "dashboard" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 16 }}>
              {machines.map((m) => {
                const sc = statusColor(m.status);
                const tempHist = tempHistRef.current[m.id] || [];
                const powerHist = powerHistRef.current[m.id] || [];
                const tempWarn = m.temperature > 75;
                const tempCrit = m.temperature > 88;
                return (
                  <div
                    key={m.id}
                    style={{
                      background: "#0d1219",
                      border: `1px solid ${m.fault_flag ? "#ff174466" : "#141c27"}`,
                      borderRadius: 8,
                      overflow: "hidden",
                      boxShadow: m.fault_flag ? "0 0 30px rgba(255,23,68,0.08)" : "none",
                      transition: "border-color 0.3s, box-shadow 0.3s",
                    }}
                  >
                    <div style={{ height: 3, background: sc, boxShadow: `0 0 8px ${sc}44`, transition: "background 0.4s" }} />

                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 8,
                              background: `${sc}11`,
                              border: `1px solid ${sc}33`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 18,
                            }}
                          >
                            {m.icon}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#e8edf3" }}>{m.name}</div>
                            <div style={{ fontSize: 8, color: "#3a4a5c", letterSpacing: 1 }}>{m.id}</div>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 700,
                            letterSpacing: 1.8,
                            padding: "3px 10px",
                            borderRadius: 3,
                            background: `${sc}18`,
                            color: sc,
                            textTransform: "uppercase",
                          }}
                        >
                          {m.status}
                        </span>
                      </div>

                      {m.fault_flag && m.current_fault && (
                        <div
                          style={{
                            background: "#1a080c",
                            border: "1px solid #ff174433",
                            borderRadius: 5,
                            padding: "8px 12px",
                            marginBottom: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: sevColor(m.current_fault.severity),
                              background: `${sevColor(m.current_fault.severity)}22`,
                              padding: "2px 6px",
                              borderRadius: 3,
                            }}
                          >
                            {m.current_fault.code}
                          </span>
                          <span style={{ fontSize: 10, color: "#ff8a80" }}>{m.current_fault.description}</span>
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          {[
                            { label: "TEMP", val: `${m.temperature.toFixed(1)}°C`, warn: tempWarn, crit: tempCrit },
                            { label: "OUTPUT", val: m.output_count.toLocaleString() },
                            { label: "POWER", val: `${m.power_usage.toFixed(2)} kW` },
                            { label: "UPTIME", val: `${m.uptime_seconds}s` },
                          ].map((d, i) => (
                            <div
                              key={i}
                              style={{
                                background: "#080c12",
                                borderRadius: 4,
                                padding: "6px 8px",
                                borderLeft: d.crit ? "2px solid #ff1744" : d.warn ? "2px solid #ffab00" : "2px solid transparent",
                              }}
                            >
                              <div style={{ fontSize: 7, color: "#3a4a5c", letterSpacing: 1.2 }}>{d.label}</div>
                              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, color: d.crit ? "#ff1744" : d.warn ? "#ffab00" : "#c5cdd9" }}>{d.val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 56 }}>
                          <div style={{ position: "relative" }}>
                            <GaugeRing value={m.utilization} max={100} color={m.utilization > 80 ? "#00e676" : m.utilization > 40 ? "#ffab00" : "#607d8b"} size={52} strokeWidth={4} />
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                fontWeight: 700,
                                color: m.utilization > 80 ? "#00e676" : "#c5cdd9",
                              }}
                            >
                              {m.utilization.toFixed(0)}%
                            </div>
                          </div>
                          <div style={{ fontSize: 7, color: "#3a4a5c", letterSpacing: 1, marginTop: 3 }}>UTIL</div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        <div style={{ flex: 1, background: "#080c12", borderRadius: 4, padding: "5px 8px" }}>
                          <div style={{ fontSize: 7, color: "#3a4a5c", letterSpacing: 1, marginBottom: 2 }}>TEMPERATURE</div>
                          <Sparkline data={tempHist} color={tempWarn ? "#ff1744" : "#42a5f5"} width={130} height={30} />
                        </div>
                        <div style={{ flex: 1, background: "#080c12", borderRadius: 4, padding: "5px 8px" }}>
                          <div style={{ fontSize: 7, color: "#3a4a5c", letterSpacing: 1, marginBottom: 2 }}>POWER DRAW</div>
                          <Sparkline data={powerHist} color="#ffab00" width={130} height={30} />
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {m.status === "idle" && <CtrlBtn onClick={() => doControl(() => API.startMachine(m.id))} color="#00e676" label="▶ START" />}
                        {m.status === "running" && <CtrlBtn onClick={() => doControl(() => API.stopMachine(m.id))} color="#607d8b" label="■ STOP" />}
                        {m.status === "fault" && <CtrlBtn onClick={() => doControl(() => API.resetMachine(m.id))} color="#ffab00" label="↻ RESET" />}
                        {m.status !== "maintenance" && <CtrlBtn onClick={() => doControl(() => API.setMaintenance(m.id))} color="#42a5f5" label="⚙ MAINT" />}
                        {m.status === "maintenance" && <CtrlBtn onClick={() => doControl(() => API.clearMaintenance(m.id))} color="#00e676" label="✓ CLR MAINT" />}
                      </div>

                      <div style={{ fontSize: 7, color: "#1e2a38", marginTop: 10 }}>Last update: {new Date(m.last_updated * 1000).toLocaleTimeString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ background: "#0d1219", border: "1px solid #141c27", borderRadius: 8, padding: "14px 20px", marginBottom: 14 }}>
              <div style={{ fontSize: 8, color: "#3a4a5c", letterSpacing: 2, marginBottom: 12 }}>PRODUCTION LINE FLOW</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, flexWrap: "wrap" }}>
                {machines.map((m, i) => {
                  const sc = statusColor(m.status);
                  const nextRunning = machines[i + 1]?.status === "running";
                  const flowActive = m.status === "running" && nextRunning;
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center" }}>
                      <div style={{ textAlign: "center", padding: "12px 16px", borderRadius: 8, border: `1px solid ${sc}44`, background: `${sc}08`, minWidth: 110, transition: "all 0.3s" }}>
                        <div style={{ fontSize: 26, marginBottom: 4 }}>{m.icon}</div>
                        <div style={{ fontSize: 9, fontWeight: 600, color: sc, letterSpacing: 1.5, marginBottom: 2 }}>{m.name.split(" ")[0].toUpperCase()}</div>
                        <div style={{ fontSize: 8, color: "#3a4a5c" }}>{m.status}</div>
                        <div style={{ fontSize: 10, color: "#546e7a", marginTop: 4, fontWeight: 600 }}>{m.output_count} units</div>
                      </div>
                      {i < machines.length - 1 && (
                        <div style={{ width: 50, height: 2, margin: "0 6px", background: flowActive ? "linear-gradient(90deg, #00e676, #00e67644)" : "#141c27", transition: "background 0.5s", position: "relative", borderRadius: 1 }}>
                          <span style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", fontSize: 12, color: flowActive ? "#00e676" : "#1e2a38", transition: "color 0.5s" }}>→</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ background: "#0d1219", border: "1px solid #141c27", borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#e8edf3", letterSpacing: 1 }}>ALARM LOG</span>
                  {unackCount > 0 && <span style={{ fontSize: 8, background: "#ff1744", color: "#fff", borderRadius: 8, padding: "2px 8px", fontWeight: 700 }}>{unackCount} ACTIVE</span>}
                </div>
                <button
                  onClick={() => setView("alarms")}
                  style={{
                    background: "transparent",
                    border: "1px solid #1e2a38",
                    color: "#3a4a5c",
                    fontSize: 8,
                    padding: "3px 10px",
                    borderRadius: 3,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    letterSpacing: 1,
                  }}
                >
                  VIEW ALL →
                </button>
              </div>
              <div style={{ maxHeight: 160, overflowY: "auto" }}>
                {alarms.length === 0 ? (
                  <div style={{ color: "#1e2a38", textAlign: "center", padding: 24, fontSize: 10 }}>No alarms. System nominal.</div>
                ) : (
                  alarms.slice(0, 10).map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 6px", borderBottom: "1px solid #141c27", opacity: a.acknowledged ? 0.3 : 1, fontSize: 10, transition: "opacity 0.3s" }}>
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: sevColor(a.fault.severity),
                          boxShadow: !a.acknowledged ? `0 0 6px ${sevColor(a.fault.severity)}` : "none",
                        }}
                      />
                      <span style={{ color: "#3a4a5c", minWidth: 62, fontSize: 9, flexShrink: 0 }}>{new Date(a.timestamp * 1000).toLocaleTimeString()}</span>
                      <span style={{ color: sevColor(a.fault.severity), fontWeight: 700, minWidth: 48, fontSize: 9 }}>{a.fault.code}</span>
                      <span style={{ color: "#546e7a", flex: 1, fontSize: 9 }}>
                        <span style={{ color: "#42a5f5" }}>[{a.machine_name}]</span> {a.fault.description}
                      </span>
                      {!a.acknowledged && (
                        <button
                          onClick={() => doControl(() => API.ackAlarm(a.id))}
                          style={{
                            background: "transparent",
                            border: "1px solid #3a4a5c",
                            color: "#607d8b",
                            padding: "1px 8px",
                            borderRadius: 3,
                            fontSize: 7,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            letterSpacing: 1,
                          }}
                        >
                          ACK
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <div style={{ background: "#0d1219", border: "1px solid #141c27", borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e8edf3", letterSpacing: 1.5 }}>ALARM HISTORY</div>
              <div style={{ display: "flex", gap: 8 }}>
                <CtrlBtn onClick={() => doControl(API.ackAll)} color="#ffab00" label="ACK ALL" />
                <CtrlBtn onClick={() => doControl(API.clearAcked)} color="#607d8b" label="CLEAR ACKED" />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: "1px solid #1e2a38", fontSize: 8, color: "#3a4a5c", letterSpacing: 1.5 }}>
              <span style={{ width: 12 }} />
              <span style={{ minWidth: 72 }}>TIME</span>
              <span style={{ minWidth: 52 }}>CODE</span>
              <span style={{ minWidth: 52 }}>SEVERITY</span>
              <span style={{ minWidth: 130 }}>MACHINE</span>
              <span style={{ flex: 1 }}>DESCRIPTION</span>
              <span style={{ minWidth: 50 }}>ACTION</span>
            </div>

            <div style={{ maxHeight: 500, overflowY: "auto" }}>
              {alarms.length === 0 ? (
                <div style={{ color: "#1e2a38", textAlign: "center", padding: 48, fontSize: 11 }}>No alarms in history.</div>
              ) : (
                alarms.map((a) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderBottom: "1px solid #0f151d", opacity: a.acknowledged ? 0.3 : 1, fontSize: 10, transition: "opacity 0.3s", background: !a.acknowledged ? `${sevColor(a.fault.severity)}05` : "transparent" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: sevColor(a.fault.severity), boxShadow: !a.acknowledged ? `0 0 8px ${sevColor(a.fault.severity)}` : "none" }} />
                    <span style={{ color: "#546e7a", minWidth: 72, fontSize: 9 }}>{new Date(a.timestamp * 1000).toLocaleTimeString()}</span>
                    <span style={{ color: sevColor(a.fault.severity), fontWeight: 700, minWidth: 52 }}>{a.fault.code}</span>
                    <span style={{ minWidth: 52, fontSize: 8, color: sevColor(a.fault.severity), textTransform: "uppercase", letterSpacing: 1 }}>{a.fault.severity}</span>
                    <span style={{ color: "#42a5f5", minWidth: 130 }}>{a.machine_name}</span>
                    <span style={{ color: "#c5cdd9", flex: 1 }}>{a.fault.description}</span>
                    <span style={{ minWidth: 50 }}>
                      {!a.acknowledged ? (
                        <button
                          onClick={() => doControl(() => API.ackAlarm(a.id))}
                          style={{ background: "#1a080c", border: "1px solid #ff174466", color: "#ff8a80", padding: "3px 10px", borderRadius: 3, fontSize: 8, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1 }}
                        >
                          ACK
                        </button>
                      ) : (
                        <span style={{ fontSize: 8, color: "#1e2a38" }}>ACKED</span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: "center", fontSize: 8, color: "#1e2a38", letterSpacing: 2, paddingBottom: 16 }}>
          FACTORYPULSE v1.0 • CONNECTED TO {API_BASE} • SIMULATED HMI/SCADA ENVIRONMENT
        </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes estopFlash { 0%,100%{background:#ff1744} 50%{background:#b71c1c} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #080c12; }
        ::-webkit-scrollbar-thumb { background: #1e2a38; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: #2a3a4d; }
      `}</style>
    </div>
  );
}
