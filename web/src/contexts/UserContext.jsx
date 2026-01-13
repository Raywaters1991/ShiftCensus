// src/contexts/UserContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import supabase from "../services/supabaseClient";
import api from "../services/api";

const UserContext = createContext();
export const useUser = () => useContext(UserContext);

function safeSet(storage, key, value) {
  try {
    if (!storage) return;
    if (value === null || value === undefined) storage.removeItem(key);
    else storage.setItem(key, String(value));
  } catch {
    // ignore
  }
}

function persistOrgContext({ orgId, orgCode }) {
  // Session (primary)
  safeSet(sessionStorage, "active_org_id", orgId);
  safeSet(sessionStorage, "org_id", orgId); // legacy
  safeSet(sessionStorage, "orgId", orgId); // legacy
  safeSet(sessionStorage, "activeOrgId", orgId); // legacy

  safeSet(sessionStorage, "org_code", orgCode);
  safeSet(sessionStorage, "active_org_code", orgCode);
  safeSet(sessionStorage, "orgCode", orgCode); // legacy
  safeSet(sessionStorage, "activeOrgCode", orgCode); // legacy

  // LocalStorage (fallback / hard refresh persistence)
  safeSet(localStorage, "active_org_id", orgId);
  safeSet(localStorage, "org_id", orgId);
  safeSet(localStorage, "orgId", orgId);
  safeSet(localStorage, "activeOrgId", orgId);

  safeSet(localStorage, "org_code", orgCode);
  safeSet(localStorage, "active_org_code", orgCode);
  safeSet(localStorage, "orgCode", orgCode);
  safeSet(localStorage, "activeOrgCode", orgCode);
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [orgMemberships, setOrgMemberships] = useState([]);
  const [activeMembership, setActiveMembership] = useState(null);

  const [loading, setLoading] = useState(true);

  async function loadOrgMemberships(userId) {
    const { data, error } = await supabase
      .from("org_memberships")
      .select(
        `
        role,
        orgs:orgs!org_memberships_org_id_fkey (
          id,
          org_code,
          name,
          logo_url
        )
      `
      )
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) {
      console.error("ORG MEMBERSHIP LOAD ERROR:", error);
      return [];
    }

    return (data || []).filter((m) => m.orgs && m.orgs.id);
  }

  async function loadUser() {
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    const authUser = auth?.user ?? null;
    setUser(authUser);

    if (!authUser) {
      setProfile(null);
      setOrgMemberships([]);
      setActiveMembership(null);
      persistOrgContext({ orgId: null, orgCode: null });
      setLoading(false);
      return;
    }

    try {
      const p = await api.get("/admin/profile");
      setProfile(p);

      const memberships = await loadOrgMemberships(authUser.id);
      setOrgMemberships(memberships);

      if (memberships.length === 0) {
        console.warn("User has no org memberships");
        setActiveMembership(null);
        persistOrgContext({ orgId: null, orgCode: null });
        setLoading(false);
        return;
      }

      // Prefer stored org id if valid, else default to first membership
      const storedOrgId =
        (typeof sessionStorage !== "undefined" && sessionStorage.getItem("active_org_id")) ||
        (typeof sessionStorage !== "undefined" && sessionStorage.getItem("org_id")) ||
        (typeof localStorage !== "undefined" && localStorage.getItem("active_org_id")) ||
        (typeof localStorage !== "undefined" && localStorage.getItem("org_id")) ||
        "";

      const selected = memberships.find((m) => String(m.orgs.id) === String(storedOrgId)) || memberships[0];

      setActiveMembership(selected);

      // ✅ Persist BOTH org id + org code in session + local storage
      persistOrgContext({ orgId: selected.orgs.id, orgCode: selected.orgs.org_code });
    } catch (e) {
      console.error("USER LOAD ERROR:", e);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadUser();

    // Optional: react to auth changes (keeps org context in sync after login/logout)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, _session) => {
      loadUser();
    });

    return () => {
      try {
        sub?.subscription?.unsubscribe?.();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchOrg(orgId) {
    const currentId = activeMembership?.orgs?.id || null;
    if (String(currentId) === String(orgId)) return; // ✅ prevents loops

    const selected = orgMemberships.find((m) => String(m.orgs.id) === String(orgId));
    if (!selected) return;

    setActiveMembership(selected);

    // ✅ Persist BOTH org id + org code in session + local storage
    persistOrgContext({ orgId: selected.orgs.id, orgCode: selected.orgs.org_code });
  }

  async function refreshUser() {
    await loadUser();
  }

  const org = activeMembership?.orgs ?? null;

  return (
    <UserContext.Provider
      value={{
        user,
        profile,

        orgMemberships,
        activeOrg: org,
        switchOrg,

        role: activeMembership?.role ?? null,

        orgId: org?.id ?? null,
        orgCode: org?.org_code ?? null,

        orgName: org?.name ?? null,
        orgLogo: org?.logo_url ?? null,

        loading,
        refreshUser,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}
