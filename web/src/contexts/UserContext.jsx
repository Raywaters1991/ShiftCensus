// src/contexts/UserContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import supabase from "../services/supabaseClient";
import api from "../services/api";

const UserContext = createContext();
export const useUser = () => useContext(UserContext);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);

  // ---------------------------------------------------------
  // Load authenticated user + profile + organization
  // ---------------------------------------------------------
  async function loadUser() {
    const { data: auth } = await supabase.auth.getUser();
    setUser(auth?.user || null);

    if (auth?.user) {
      try {
        console.log("Fetching profile...");
        const p = await api.get("/admin/profile");
console.log("PROFILE RESPONSE →", p);


        setProfile(p);

        // Org code provided by profile
        if (p.org_code) {
          sessionStorage.setItem("org_code", p.org_code);

          // ⭐ USE ORG DATA FROM THE PROFILE — your backend includes it here
          const orgData = {
            name: p.org_name || "",
            logo_url: p.org_logo || "",
            org_code: p.org_code || "",
          };

          setOrganization(orgData);

          // Cache for refresh-safe usage
          sessionStorage.setItem("org_logo", orgData.logo_url || "");
          sessionStorage.setItem("org_name", orgData.name || "");
        }

        // Role
        if (p.role) {
          sessionStorage.setItem("role", p.role);
        }
      } catch (e) {
        console.error("PROFILE LOAD ERROR:", e);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    loadUser();
  }, []);

  async function refreshUser() {
    await loadUser();
  }

  return (
    <UserContext.Provider
      value={{
        user,
        profile,

        // role
        role: profile?.role || sessionStorage.getItem("role") || null,

        // org_code
        orgCode: profile?.org_code || sessionStorage.getItem("org_code") || null,

        // ⭐ LOGO PRIORITY
        orgLogo:
          organization?.logo_url ||
          profile?.org_logo ||
          sessionStorage.getItem("org_logo") ||
          null,

        // ⭐ NAME PRIORITY
        orgName:
          organization?.name ||
          profile?.org_name ||
          sessionStorage.getItem("org_name") ||
          null,

        loading,
        refreshUser,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}
