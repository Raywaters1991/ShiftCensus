// web/src/contexts/UserContext.jsx
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
    (typeof sessionStorage !== "undefined" && sessionStorage.getItem("active_org_id")) ||
    (typeof localStorage !== "undefined" && localStorage.getItem("active_org_id")) ||
    "";

  const orgCode =
    (typeof sessionStorage !== "undefined" && sessionStorage.getItem("active_org_code")) ||
    (typeof localStorage !== "undefined" && localStorage.getItem("active_org_code")) ||
    "";

  return { orgId, orgCode };
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [orgMemberships, setOrgMemberships] = useState([]);
  const [activeOrg, setActiveOrg] = useState(null);

  // This is the UI role you use throughout the app
  const [activeMembershipRole, setActiveMembershipRole] = useState(null);

  // Helpful flags for routing/UI
  const [appRole, setAppRole] = useState(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  // ✅ NEW: org-scoped permissions
  const [permissions, setPermissions] = useState(null);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [canScheduleWrite, setCanScheduleWrite] = useState(false);

  const [loading, setLoading] = useState(true);

  // Prevent overlapping loads on rapid auth changes
  const loadInFlight = useRef(false);

  async function loadUser() {
    if (loadInFlight.current) return;
    loadInFlight.current = true;

    setLoading(true);

    // 1) Auth user
    const { data: auth } = await supabase.auth.getUser();
    const authUser = auth?.user ?? null;
    setUser(authUser);

    if (!authUser) {
      setProfile(null);
      setOrgMemberships([]);
      setActiveOrg(null);
      setActiveMembershipRole(null);
      setAppRole(null);
      setIsSuperadmin(false);

      // ✅ perms reset
      setPermissions(null);
      setIsOrgAdmin(false);
      setCanManageAdmins(false);
      setCanScheduleWrite(false);

      persistOrgContext({ orgId: null, orgCode: null, orgName: null });
      setLoading(false);
      loadInFlight.current = false;
      return;
    }

    try {
      // 2) Backend profile (your existing endpoint)
      const p = await api.get("/admin/profile");
      setProfile(p);

      // 3) Bootstrap (backend is source of truth for org + role + perms)
      const stored = readStoredOrg();

      // If stored orgCode is ADMIN, don't send it; let backend pick default
      const safeStoredOrgCode =
        stored.orgCode && String(stored.orgCode).toUpperCase() !== "ADMIN"
          ? stored.orgCode
          : "";

      const bootstrap = await api.get("/me/bootstrap", {
        headers: safeStoredOrgCode ? { "X-Org-Code": safeStoredOrgCode } : undefined,
      });

      const org = bootstrap?.activeOrg || null;
      setActiveOrg(org);

      const bootAppRole = bootstrap?.appRole || p?.role || null;
      setAppRole(bootAppRole);

      const superFlag =
        !!bootstrap?.isSuperadmin || String(bootAppRole || "").toLowerCase() === "superadmin";
      setIsSuperadmin(superFlag);

      // Role for UI permissions:
      // - If superadmin, force "superadmin"
      // - Else use membershipRole from bootstrap (or profile role fallback)
      const roleForUi = superFlag
        ? "superadmin"
        : (bootstrap?.membershipRole || p?.role || null);

      setActiveMembershipRole(roleForUi);

      // ✅ NEW: org scoped perms
      const perms = bootstrap?.permissions || null;
      setPermissions(perms);

      setIsOrgAdmin(superFlag || !!perms?.is_admin);
      setCanManageAdmins(superFlag || !!perms?.can_manage_admins);
      setCanScheduleWrite(superFlag || !!perms?.can_schedule_write);

      persistOrgContext({
        orgId: org?.id || null,
        orgCode: org?.org_code || null,
        orgName: org?.name || null,
      });

      // 4) Memberships through backend (avoids RLS)
      const memRes = await api.get("/me/memberships");
      const memberships = Array.isArray(memRes?.memberships) ? memRes.memberships : [];
      setOrgMemberships(memberships);

      // 5) If we have no active org but memberships exist, pick the first
      if (!org?.id && memberships.length > 0) {
        const firstOrg = memberships[0]?.orgs;
        if (firstOrg?.id) {
          setActiveOrg(firstOrg);

          // update perms from membership list if present
          const firstPerms = memberships[0]?.permissions || null;
          setPermissions(firstPerms);
          setIsOrgAdmin(superFlag || !!firstPerms?.is_admin);
          setCanManageAdmins(superFlag || !!firstPerms?.can_manage_admins);
          setCanScheduleWrite(superFlag || !!firstPerms?.can_schedule_write);

          persistOrgContext({
            orgId: firstOrg.id,
            orgCode: firstOrg.org_code,
            orgName: firstOrg.name,
          });
        }
      }
    } catch (e) {
      console.error("USER LOAD ERROR:", e);
    }

    setLoading(false);
    loadInFlight.current = false;
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

    // find in loaded memberships (superadmin will have all orgs)
    const selected = orgMemberships.find((m) => String(m?.orgs?.id) === String(orgId));
    const org = selected?.orgs || null;

    if (org?.id) {
      setActiveOrg(org);

      // if you're superadmin, stay superadmin regardless of selected.role
      const nextRole = isSuperadmin ? "superadmin" : (selected?.role || activeMembershipRole || null);
      setActiveMembershipRole(nextRole);

      // ✅ update permissions from membership record (or infer)
      const nextPerms = isSuperadmin
        ? {
            role: "superadmin",
            is_admin: true,
            can_manage_admins: true,
            can_schedule_write: true,
            department_id: null,
            is_active: true,
          }
        : (selected?.permissions || {
            role: selected?.role || null,
            is_admin: !!selected?.is_admin,
            can_manage_admins: !!selected?.can_manage_admins,
            can_schedule_write: !!selected?.can_schedule_write,
            department_id: selected?.department_id || null,
            is_active: true,
          });

      setPermissions(nextPerms);
      setIsOrgAdmin(isSuperadmin || !!nextPerms?.is_admin);
      setCanManageAdmins(isSuperadmin || !!nextPerms?.can_manage_admins);
      setCanScheduleWrite(isSuperadmin || !!nextPerms?.can_schedule_write);

      persistOrgContext({
        orgId: org.id,
        orgCode: org.org_code,
        orgName: org.name,
      });

      return;
    }

    console.warn("switchOrg: org not found in memberships", orgId);
  }

  const value = useMemo(
    () => ({
      user,
      profile,

      orgMemberships,
      activeOrg,
      switchOrg,

      role: activeMembershipRole,
      appRole,
      isSuperadmin,

      // ✅ permissions
      permissions,
      isOrgAdmin,
      canManageAdmins,
      canScheduleWrite,

      orgId: activeOrg?.id ?? null,
      orgCode: activeOrg?.org_code ?? null,
      orgName: activeOrg?.name ?? null,
      orgLogo: activeOrg?.logo_url ?? null,

      loading,
      refreshUser: loadUser,
    }),
    [
      user,
      profile,
      orgMemberships,
      activeOrg,
      activeMembershipRole,
      appRole,
      isSuperadmin,
      permissions,
      isOrgAdmin,
      canManageAdmins,
      canScheduleWrite,
      loading,
    ]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
