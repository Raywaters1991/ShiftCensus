import { useEffect, useState } from "react";
import api from "../services/api";

export default function StaffPage() {
  const [staff, setStaff] = useState([]);

  // Add staff inputs
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Edit mode
  const [editId, setEditId] = useState(null);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  // Delete modal
  const [deleteId, setDeleteId] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Search + Sorting
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState("name-asc");

  useEffect(() => {
    loadStaff();
  }, []);

  const loadStaff = async () => {
    const res = await api.get("/staff", {
      headers: {
        "x-org-code": localStorage.getItem("orgCode")
      }
    });
    setStaff(res.data);
  };

  const addStaff = async () => {
    if (!firstName || !lastName || !role) {
      alert("Please fill in all fields");
      return;
    }

    const payload = {
      name: `${firstName.trim()} ${lastName.trim()}`,
      role,
      email,
      phone
    };

    try {
      const res = await api.post(
        "/staff",
        payload,
        {
          headers: {
            "x-org-code": localStorage.getItem("orgCode")
          }
        }
      );

      setStaff([...staff, res.data]);

      setFirstName("");
      setLastName("");
      setRole("");
      setEmail("");
      setPhone("");
    } catch (err) {
      console.error("Failed to add staff:", err);
      alert("Error adding staff. Check console.");
    }
  };

  const startEdit = (person) => {
    const [first, ...rest] = person.name.split(" ");
    const last = rest.join(" ");

    setEditId(person.id);
    setEditFirst(first);
    setEditLast(last);
    setEditRole(person.role);
    setEditEmail(person.email || "");
    setEditPhone(person.phone || "");
  };

  const saveEdit = async () => {
    const fullName = `${editFirst.trim()} ${editLast.trim()}`;

    const payload = {
      name: fullName,
      role: editRole,
      email: editEmail,
      phone: editPhone
    };

    const res = await api.put(`/staff/${editId}`, payload, {
      headers: {
        "x-org-code": localStorage.getItem("orgCode")
      }
    });

    setStaff(
      staff.map((s) =>
        s.id === editId
          ? { ...s, name: fullName, role: editRole, email: editEmail, phone: editPhone }
          : s
      )
    );

    setEditId(null);
  };

  const confirmDelete = (id) => {
    setDeleteId(id);
    setShowModal(true);
  };

  const deleteStaff = async () => {
    await api.delete(`/staff/${deleteId}`, {
      headers: {
        "x-org-code": localStorage.getItem("orgCode")
      }
    });

    setStaff(staff.filter((s) => s.id !== deleteId));
    setShowModal(false);
    setDeleteId(null);
  };

  // Search + Sort
  const normalizedSearch = searchTerm.toLowerCase();

  const filtered = staff.filter((s) =>
    s.name.toLowerCase().includes(normalizedSearch)
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortOption === "name-asc") return a.name.localeCompare(b.name);
    if (sortOption === "name-desc") return b.name.localeCompare(a.name);
    if (sortOption === "role-asc") return a.role.localeCompare(b.role);
    if (sortOption === "role-desc") return b.role.localeCompare(a.role);
    return 0;
  });

  return (
    <div style={{ padding: "20px", fontFamily: "Arial", color: "white" }}>
      <h1>Staff Management</h1>

      {/* Search + Sort Controls */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
        <input
          placeholder="Search staff..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: "8px", width: "200px" }}
        />

        <select
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value)}
          style={{ padding: "8px" }}
        >
          <option value="name-asc">Sort: Name A → Z</option>
          <option value="name-desc">Sort: Name Z → A</option>
          <option value="role-asc">Sort: Role A → Z</option>
          <option value="role-desc">Sort: Role Z → A</option>
        </select>
      </div>

      {/* Add Staff Form */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <input
          placeholder="First Name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          style={{ padding: "8px", width: "130px" }}
        />

        <input
          placeholder="Last Name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          style={{ padding: "8px", width: "130px" }}
        />

        <input
          placeholder="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: "8px", width: "160px" }}
        />

        <input
          placeholder="Phone (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ padding: "8px", width: "140px" }}
        />

        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{ padding: "8px", width: "120px" }}
        >
          <option value="">Role</option>
          <option value="RN">RN</option>
          <option value="LPN">LPN</option>
          <option value="CNA">CNA</option>
        </select>

        <button
          onClick={addStaff}
          style={{
            padding: "8px 14px",
            background: "#555",
            border: "1px solid #777",
            color: "white",
            cursor: "pointer",
          }}
        >
          Add Staff
        </button>
      </div>

      {/* Staff Table */}
      <table border="1" cellPadding="12" style={{ width: "100%", textAlign: "left" }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Role</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {sorted.map((s) => {
            const isEditing = editId === s.id;

            return (
              <tr key={s.id}>
                <td>{s.id}</td>

                <td>
                  {isEditing ? (
                    <div style={{ display: "flex", gap: "5px" }}>
                      <input
                        value={editFirst}
                        onChange={(e) => setEditFirst(e.target.value)}
                        style={{ width: "90px" }}
                      />
                      <input
                        value={editLast}
                        onChange={(e) => setEditLast(e.target.value)}
                        style={{ width: "90px" }}
                      />
                    </div>
                  ) : (
                    s.name
                  )}
                </td>

                <td>
                  {isEditing ? (
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      style={{ padding: "6px" }}
                    >
                      <option value="RN">RN</option>
                      <option value="LPN">LPN</option>
                      <option value="CNA">CNA</option>
                    </select>
                  ) : (
                    s.role
                  )}
                </td>

                <td>
                  {isEditing ? (
                    <input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                    />
                  ) : (
                    s.email || "-"
                  )}
                </td>

                <td>
                  {isEditing ? (
                    <input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                    />
                  ) : (
                    s.phone || "-"
                  )}
                </td>

                <td>
                  {isEditing ? (
                    <>
                      <button
                        onClick={saveEdit}
                        style={{
                          padding: "6px 12px",
                          background: "#0066ff",
                          color: "white",
                          border: "none",
                          cursor: "pointer",
                          marginRight: "8px",
                        }}
                      >
                        Save
                      </button>

                      <button
                        onClick={() => setEditId(null)}
                        style={{
                          padding: "6px 12px",
                          background: "#555",
                          color: "white",
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(s)}
                        style={{
                          padding: "6px 12px",
                          background: "#444",
                          color: "white",
                          marginRight: "8px",
                        }}
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => confirmDelete(s.id)}
                        style={{
                          padding: "6px 12px",
                          background: "#c62828",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Delete Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
          }}
        >
          <div
            style={{
              background: "white",
              padding: "30px",
              borderRadius: "10px",
              width: "300px",
              textAlign: "center",
              color: "black"
            }}
          >
            <h3>Are you sure?</h3>
            <p>This will permanently delete this staff member.</p>

            <button
              onClick={deleteStaff}
              style={{
                background: "#c62828",
                color: "white",
                padding: "10px 20px",
                marginRight: "10px",
                border: "none",
                cursor: "pointer"
              }}
            >
              Delete
            </button>

            <button
              onClick={() => setShowModal(false)}
              style={{
                background: "#444",
                color: "white",
                padding: "10px 20px",
                border: "none",
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
