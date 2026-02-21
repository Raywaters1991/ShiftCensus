// web/src/contexts/UserContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import supabase from "../services/supabaseClient";
import api from "../services/api";

const UserContext = createContext();
export const useUser = () => useContext(UserContext);

function safeSet(storage, key, value) {
  try {
    if (!storage) return;
    if (value === null || value === undefined || value === "") storage.removeItem(key);
    else storage.setItem(key, String(value));
  } catch {}
}

function persistOrgContext({ orgId, orgCode, orgName }) {
  // SessionStorage (primary)
  safeSet(sessionStorage, "active_org_id", orgId);
  safeSet(sessionStorage, "active_org_code", orgCode);
  safeSet(sessionStorage, "active_org_name", orgName);

  // LocalStorage (fallback)
  safeSet(localStorage, "active_org_id", orgId);
  safeSet(localStorage, "active_org_code", orgCode);
  safeSet(localStorage, "active_org_name", orgName);
}

function readStoredOrg() {
  const orgId =
    sessionStorage.getItem("active_org_id") ||
    localStorage.getItem("active_org_id") ||
    "";
  const orgCode =
    sessionStorage.getItem("active_org_code") ||
    localStorage.getItem("active_org_code") ||
    "";
  return { orgId, orgCode };
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [orgMemberships, setOrgMemberships] = useState([]);
  const [activeOrg, setActiveOrg] = useState(null);
  const [activeMembershipRole, setActiveMembershipRole] = useState(null);

  const [loading, setLoading] = useState(true);

  async function loadUser() {
    setLoading(true);

    // 1) Auth user (from supabase session)
    const { data: auth } = await supabase.auth.getUser();
    const authUser = auth?.user ?? null;
    setUser(authUser);

    if (!authUser) {
      setProfile(null);
      setOrgMemberships([]);
      setActiveOrg(null);
      setActiveMembershipRole(null);
      persistOrgContext({ orgId: null, orgCode: null, orgName: null });
      setLoading(false);
      return;
    }

    try {
      // 2) Load backend profile (your existing endpoint)
      const p = await api.get("/admin/profile");
      setProfile(p);

      // 3) Resolve active org from backend (single source of truth)
      // Send stored org_code if you have it (helps superadmin switching)
      const stored = readStoredOrg();
      const bootstrap = await api.get("/me/bootstrap", {
        headers: stored.orgCode ? { "X-Org-Code": stored.orgCode } : undefined,
      });

      const org = bootstrap?.activeOrg || null;
      setActiveOrg(org);
      setActiveMembershipRole(bootstrap?.membershipRole || p?.role || null);

      persistOrgContext({
        orgId: org?.id || null,
        orgCode: org?.org_code || null,
        orgName: org?.name || null,
      });

      // 4) Fetch memberships through backend (avoids RLS headaches)
      const memRes = await api.get("/me/memberships");
      const memberships = Array.isArray(memRes?.memberships) ? memRes.memberships : [];
      setOrgMemberships(memberships);
    } catch (e) {
      console.error("USER LOAD ERROR:", e);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadUser();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    return () => {
      try {
        sub?.subscription?.unsubscribe?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchOrg(orgId) {
    if (!orgId) return;

    // Find in memberships first
    const selected = orgMemberships.find((m) => String(m?.orgs?.id) === String(orgId));
    const org = selected?.orgs || null;

    if (org?.id) {
      setActiveOrg(org);
      setActiveMembershipRole(selected?.role || activeMembershipRole || null);
      persistOrgContext({ orgId: org.id, orgCode: org.org_code, orgName: org.name });
      return;
    }

    // If not in memberships, attempt lookup via backend bootstrap by setting org_code in storage
    // (you can also create a dedicated backend endpoint later for org switching)
    console.warn("switchOrg: org not found in memberships");
  }

  const value = useMemo(
    () => ({
      user,
      profile,

      orgMemberships,
      activeOrg,
      switchOrg,

      role: activeMembershipRole,

      orgId: activeOrg?.id ?? null,
      orgCode: activeOrg?.org_code ?? null,
      orgName: activeOrg?.name ?? null,
      orgLogo: activeOrg?.logo_url ?? null,

      loading,
      refreshUser: loadUser,
    }),
    [user, profile, orgMemberships, activeOrg, activeMembershipRole, loading]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
