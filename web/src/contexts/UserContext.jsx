// src/contexts/UserContext.jsx
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
  } catch {
    // ignore
  }
}

function readFirst(...keys) {
  for (const k of keys) {
    const v =
      (typeof sessionStorage !== "undefined" && sessionStorage.getItem(k)) ||
      (typeof localStorage !== "undefined" && localStorage.getItem(k)) ||
      "";
    if (v) return v;
  }
  return "";
}

function persistOrgContext({ orgId, orgCode, orgName }) {
  // Session (primary)
  safeSet(sessionStorage, "active_org_id", orgId);
  safeSet(sessionStorage, "org_id", orgId);
  safeSet(sessionStorage, "orgId", orgId);
  safeSet(sessionStorage, "activeOrgId", orgId);

  safeSet(sessionStorage, "org_code", orgCode);
  safeSet(sessionStorage, "active_org_code", orgCode);
  safeSet(sessionStorage, "orgCode", orgCode);
  safeSet(sessionStorage, "activeOrgCode", orgCode);

  safeSet(sessionStorage, "active_org_name", orgName);

  // LocalStorage (fallback / hard refresh)
  safeSet(localStorage, "active_org_id", orgId);
  safeSet(localStorage, "org_id", orgId);
  safeSet(localStorage, "orgId", orgId);
  safeSet(localStorage, "activeOrgId", orgId);

  safeSet(localStorage, "org_code", orgCode);
  safeSet(localStorage, "active_org_code", orgCode);
  safeSet(localStorage, "orgCode", orgCode);
  safeSet(localStorage, "activeOrgCode", orgCode);

  safeSet(localStorage, "active_org_name", orgName);
}

function getRoleFromProfileOrAuth(profile, user) {
  const r =
    profile?.role ||
    user?.app_metadata?.role ||
    user?.user_metadata?.role ||
    null;

  // Supabase default role is "authenticated" — not an app role
  if (!r || String(r).toLowerCase() === "authenticated") return null;
  return String(r).toLowerCase();
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [orgMemberships, setOrgMemberships] = useState([]);
  const [activeOrg, setActiveOrg] = useState(null); // org object
  const [activeMembershipRole, setActiveMembershipRole] = useState(null);

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

  async function loadOrgByStoredSelection() {
    const storedOrgId = readFirst("active_org_id", "org_id", "orgId", "activeOrgId");
    const storedOrgCode = readFirst("org_code", "active_org_code", "orgCode", "activeOrgCode");

    // Prefer orgId (strong)
    if (storedOrgId) {
      const { data: org, error } = await supabase
        .from("orgs")
        .select("id, org_code, name, logo_url")
        .eq("id", storedOrgId)
        .maybeSingle();

      if (!error && org?.id) return org;
    }

    // Fallback orgCode (weak)
    if (storedOrgCode) {
      const { data: org, error } = await supabase
        .from("orgs")
        .select("id, org_code, name, logo_url")
        .eq("org_code", storedOrgCode)
        .maybeSingle();

      if (!error && org?.id) return org;
    }

    return null;
  }

  async function loadUser() {
    setLoading(true);

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
      // your backend profile endpoint
      const p = await api.get("/admin/profile");
      setProfile(p);

      const appRole = getRoleFromProfileOrAuth(p, authUser);

      // ✅ SUPERADMIN BYPASS:
      // If superadmin, do NOT require org_memberships. Use stored selection.
      if (appRole === "superadmin") {
        const org = await loadOrgByStoredSelection();

        setOrgMemberships([]); // optional; you can also load all orgs elsewhere
        setActiveMembershipRole("superadmin");

        if (org?.id) {
          setActiveOrg(org);
          persistOrgContext({ orgId: org.id, orgCode: org.org_code, orgName: org.name });
        } else {
          // No facility selected yet
          setActiveOrg(null);
          persistOrgContext({ orgId: null, orgCode: null, orgName: null });
        }

        setLoading(false);
        return;
      }

      // ✅ Normal users (membership-driven)
      const memberships = await loadOrgMemberships(authUser.id);
      setOrgMemberships(memberships);

      if (memberships.length === 0) {
        console.warn("User has no org memberships");
        setActiveOrg(null);
        setActiveMembershipRole(null);
        persistOrgContext({ orgId: null, orgCode: null, orgName: null });
        setLoading(false);
        return;
      }

      const storedOrgId = readFirst("active_org_id", "org_id");
      const selected =
        memberships.find((m) => String(m.orgs.id) === String(storedOrgId)) || memberships[0];

      setActiveOrg(selected.orgs);
      setActiveMembershipRole(selected.role || null);

      persistOrgContext({
        orgId: selected.orgs.id,
        orgCode: selected.orgs.org_code,
        orgName: selected.orgs.name,
      });
    } catch (e) {
      console.error("USER LOAD ERROR:", e);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadUser();

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
    // For superadmin, you might switch orgs from SuperAdmin page; we just persist
    if (!orgId) return;

    // Normal users can only switch among memberships they have
    const selectedMembership = orgMemberships.find((m) => String(m.orgs.id) === String(orgId));
    if (selectedMembership) {
      setActiveOrg(selectedMembership.orgs);
      setActiveMembershipRole(selectedMembership.role || null);
      persistOrgContext({
        orgId: selectedMembership.orgs.id,
        orgCode: selectedMembership.orgs.org_code,
        orgName: selectedMembership.orgs.name,
      });
      return;
    }

    // If not in memberships, we still allow superadmin (or future behavior) by direct lookup
    (async () => {
      const { data: org } = await supabase
        .from("orgs")
        .select("id, org_code, name, logo_url")
        .eq("id", orgId)
        .maybeSingle();

      if (org?.id) {
        setActiveOrg(org);
        setActiveMembershipRole("superadmin");
        persistOrgContext({ orgId: org.id, orgCode: org.org_code, orgName: org.name });
      }
    })();
  }

  const org = activeOrg;

  const value = useMemo(
    () => ({
      user,
      profile,

      orgMemberships,
      activeOrg: org,
      switchOrg,

      role: activeMembershipRole,

      orgId: org?.id ?? null,
      orgCode: org?.org_code ?? null,

      orgName: org?.name ?? null,
      orgLogo: org?.logo_url ?? null,

      loading,
      refreshUser: loadUser,
    }),
    [user, profile, orgMemberships, org, activeMembershipRole, loading]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
