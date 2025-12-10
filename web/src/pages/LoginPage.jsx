import { useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../services/supabaseClient";
import { useUser } from "../contexts/UserContext.jsx";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { refreshUser } = useUser();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Step 1 — authenticate
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    // Step 2 — save JWT token
    const session = data.session;
    const token = session?.access_token;
    sessionStorage.setItem("token", token);

    // Step 3 — get user metadata (role + org_code)
    const { data: authUser } = await supabase.auth.getUser();

    const role = authUser?.user?.user_metadata?.role || "";
    const org_code = authUser?.user?.user_metadata?.org_code || "";

    // Step 4 — save clean values
    sessionStorage.setItem("role", role);
    sessionStorage.setItem("org_code", org_code);

    // Step 5 — update global state
    await refreshUser();

    // Step 6 — proceed
    navigate("/");
    setLoading(false);
  };

  return (
    <div style={{ padding: 40, color: "white" }}>
      <h2>Login</h2>
      <form onSubmit={handleLogin}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={input}
        />

        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={input}
        />

        <button type="submit" style={button}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}

const input = {
  width: "100%",
  padding: 10,
  marginBottom: 20,
  background: "#111",
  color: "white",
  border: "1px solid #444",
};

const button = {
  width: "100%",
  padding: 12,
  background: "#007bff",
  color: "white",
  border: "none",
  borderRadius: 6,
  fontWeight: "bold",
  cursor: "pointer",
};
