import { useEffect, useState } from "react";
import api from "../services/api";

export default function CensusPage() {
  const [rooms, setRooms] = useState([]);
  const [unitFilter, setUnitFilter] = useState("All");

  useEffect(() => {
    loadCensus();
    const interval = setInterval(loadCensus, 5000); // Auto-refresh
    return () => clearInterval(interval);
  }, []);

  const loadCensus = async () => {
    const response = await api.get("/census");
    setRooms(response.data);
  };

  // Filter rooms by selected unit
  const filteredRooms = rooms.filter(
    (room) => unitFilter === "All" || room.unit === unitFilter
  );

  return (
    <div style={{ padding: "20px", fontFamily: "Arial", width: "100%" }}>
      <h1 style={{ fontSize: "32px", marginBottom: "10px" }}>
        Census Dashboard
      </h1>

      {/* Fullscreen Button */}
      <button
        onClick={() => document.documentElement.requestFullscreen()}
        style={{
          padding: "12px 20px",
          marginBottom: "20px",
          fontSize: "18px",
          cursor: "pointer",
        }}
      >
        Enter Fullscreen
      </button>

      {/* Census Totals */}
      <div
        style={{
          marginBottom: "20px",
          fontSize: "20px",
          fontWeight: "bold",
        }}
      >
        <div>Total Rooms: {rooms.length}</div>
        <div>Occupied: {rooms.filter((r) => r.status === "Occupied").length}</div>
        <div>Empty: {rooms.filter((r) => r.status === "Empty").length}</div>
      </div>

      {/* Color Legend */}
      <div style={{ marginBottom: "20px", fontSize: "18px" }}>
        <span
          style={{
            backgroundColor: "#ff7a7a",
            padding: "6px 14px",
            borderRadius: "6px",
            marginRight: "10px",
          }}
        >
          Occupied
        </span>

        <span
          style={{
            backgroundColor: "#7bff7a",
            padding: "6px 14px",
            borderRadius: "6px",
          }}
        >
          Empty
        </span>
      </div>

      {/* Unit Filter */}
      <select
        value={unitFilter}
        onChange={(e) => setUnitFilter(e.target.value)}
        style={{
          padding: "10px",
          fontSize: "18px",
          marginBottom: "20px",
        }}
      >
        <option value="All">All Units</option>
        <option value="A-Wing">A-Wing</option>
        <option value="B-Wing">B-Wing</option>
        <option value="Memory Care">Memory Care</option>
      </select>

      {/* Room Tile Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "20px",
          width: "100%",
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        {filteredRooms.map((room) => (
          <div
            key={room.id}
            style={{
              padding: "20px",
              borderRadius: "12px",
              backgroundColor:
                room.status === "Occupied" ? "#ff7a7a" : "#7bff7a",
              color: "#000",
              fontWeight: "bold",
              textAlign: "center",
              fontSize: "26px",
              boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ fontSize: "32px" }}>{room.room}</div>
            <div style={{ fontSize: "22px", marginTop: "10px" }}>
              {room.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
