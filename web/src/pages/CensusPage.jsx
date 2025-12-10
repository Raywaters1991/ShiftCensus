import { useEffect, useState } from "react";
import api from "../services/api";

export default function CensusPage() {
  const [rows, setRows] = useState([]);
  const [room, setRoom] = useState("");
  const [status, setStatus] = useState("");

  // Load census rows
  const load = async () => {
    try {
      const data = await api.get("/census");
      setRows(data || []);
    } catch (err) {
      console.error("Failed to load census:", err);
      setRows([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!room.trim() || !status.trim()) {
      alert("Room and status required.");
      return;
    }

    try {
      await api.post("/census", {
        room: room.trim(),
        status: status.trim(),
      });

      setRoom("");
      setStatus("");
      load();
    } catch (err) {
      console.error("Failed to add census row:", err);
      alert("Failed to add row.");
    }
  }

  return (
    <div style={{ padding: 30, color: "white" }}>
      <h1>Census</h1>

      <div style={{ display: "flex", gap: 10 }}>
        <input
          placeholder="Room"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          style={{ padding: 10 }}
        />
        <input
          placeholder="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ padding: 10 }}
        />
        <button onClick={create} style={{ padding: "10px 20px" }}>
          Add
        </button>
      </div>

      <table style={{ width: "100%", marginTop: 30 }}>
        <thead>
          <tr>
            <th style={th}>Room</th>
            <th style={th}>Status</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={td}>{r.room}</td>
              <td style={td}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = { textAlign: "left", padding: 10 };
const td = { padding: 10, borderTop: "1px solid #333" };
