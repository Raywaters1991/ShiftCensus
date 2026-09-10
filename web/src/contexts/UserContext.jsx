// web/src/contexts/UserContext.jsx
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import supabase from "../services/supabaseClient";
import api from "../services/api";

const UserContext = createContext();
export const useUser = () => useContext(UserContext);

const AUTH_TIMEOUT_MS = 12000;

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function safeSet(storage, key, value) {
  try {
    if (!storage) return;
    if (value === null || value === undefined || value === "") storage.removeItem(key);
    else storage.setItem(key, String(value));
  } catch {}
}

function persistOrgContext({ orgId, orgCode, orgName }) {
  safeSet(sessionStorage, "active_org_id", orgId);
  safeSet(sessionStorage, "active_org_code", orgCode);
  safeSet(sessionStorage, "active_org_name", orgName);
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
  const [activeMembershipRole, setActiveMembershipRole] = useState(null);
  const [appRole, setAppRole] = useState(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [permissions, setPermissions] = useState(null);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [canScheduleWrite, setCanScheduleWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(null);

  const loadPromiseRef = useRef(null);

  async function performLoadUser() {
    setLoading(true);
    setConnectionError(null);
    try {
      const { data: auth, error: authError } = await withTimeout(
        supabase.auth.getUser(),
        AUTH_TIMEOUT_MS,
        "ShiftCensus could not reach the authentication service."
      );
      if (authError) throw authError;

      const authUser = auth?.user ?? null;
      setUser(authUser);

      if (!authUser) {
        setProfile(null);
        setOrgMemberships([]);
        setActiveOrg(null);
        setActiveMembershipRole(null);
        setAppRole(null);
        setIsSuperadmin(false);
        setPermissions(null);
        setIsOrgAdmin(false);
        setCanManageAdmins(false);
        setCanScheduleWrite(false);
        persistOrgContext({ orgId: null, orgCode: null, orgName: null });
        return;
      }

      const p = await withTimeout(api.get("/admin/profile"), AUTH_TIMEOUT_MS, "ShiftCensus could not reach the server.");
      setProfile(p);

      const stored = readStoredOrg();
      const safeStoredOrgCode =
        stored.orgCode && String(stored.orgCode).toUpperCase() !== "ADMIN"
          ? stored.orgCode
          : "";

      const bootstrap = await withTimeout(
        api.get("/me/bootstrap", {
          headers: safeStoredOrgCode ? { "X-Org-Code": safeStoredOrgCode } : undefined,
        }),
        AUTH_TIMEOUT_MS,
        "ShiftCensus could not load your facility information."
      );

      const org = bootstrap?.activeOrg || null;
      setActiveOrg(org);

      const bootAppRole = bootstrap?.appRole || p?.role || null;
      setAppRole(bootAppRole);

      const superFlag =
        !!bootstrap?.isSuperadmin || String(bootAppRole || "").toLowerCase() === "superadmin";
      setIsSuperadmin(superFlag);

      const roleForUi = superFlag
        ? "superadmin"
        : (bootstrap?.membershipRole || p?.role || null);
      setActiveMembershipRole(roleForUi);

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

      const memRes = await withTimeout(api.get("/me/memberships"), AUTH_TIMEOUT_MS, "ShiftCensus could not load your organizations.");
      const memberships = Array.isArray(memRes?.memberships) ? memRes.memberships : [];
      setOrgMemberships(memberships);

      if (!org?.id && memberships.length > 0) {
        const firstOrg = memberships[0]?.orgs;
        if (firstOrg?.id) {
          setActiveOrg(firstOrg);
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
      const message = String(e?.message || "").toLowerCase();
      const invalidSession =
        message.includes("invalid jwt") ||
        message.includes("invalid refresh token") ||
        message.includes("refresh token not found") ||
        message.includes("session not found");

      if (invalidSession) {
        setUser(null);
      } else {
        setConnectionError({
          message: e?.message || "ShiftCensus is temporarily unable to connect.",
          occurredAt: new Date().toISOString(),
        });
      }
    } finally {
      setLoading(false);
    }
  }

  function loadUser() {
    if (loadPromiseRef.current) return loadPromiseRef.current;
    const run = performLoadUser();
    loadPromiseRef.current = run;
    return run.finally(() => {
      if (loadPromiseRef.current === run) loadPromiseRef.current = null;
    });
  }

  useEffect(() => {
    loadUser();
    const { data: sub } = supabase.auth.onAuthStateChange(() => loadUser());
    return () => {
      try { sub?.subscription?.unsubscribe?.(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function switchOrg(orgId) {
    if (!orgId) return;
    const selected = orgMemberships.find((m) => String(m?.orgs?.id) === String(orgId));
    const org = selected?.orgs || null;

    if (org?.id) {
      setActiveOrg(org);
      const nextRole = isSuperadmin ? "superadmin" : (selected?.role || activeMembershipRole || null);
      setActiveMembershipRole(nextRole);
      const nextPerms = isSuperadmin
        ? { role: "superadmin", is_admin: true, can_manage_admins: true, can_schedule_write: true, department_id: null, is_active: true }
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
      persistOrgContext({ orgId: org.id, orgCode: org.org_code, orgName: org.name });
      return;
    }
    console.warn("switchOrg: org not found in memberships", orgId);
  }

  const value = useMemo(
    () => ({
      user, profile, orgMemberships, activeOrg, switchOrg,
      role: activeMembershipRole, appRole, isSuperadmin, permissions,
      isOrgAdmin, canManageAdmins, canScheduleWrite,
      orgId: activeOrg?.id ?? null,
      orgCode: activeOrg?.org_code ?? null,
      orgName: activeOrg?.name ?? null,
      orgLogo: activeOrg?.logo_url ?? null,
      loading, connectionError, refreshUser: loadUser,
    }),
    [user, profile, orgMemberships, activeOrg, activeMembershipRole, appRole, isSuperadmin, permissions, isOrgAdmin, canManageAdmins, canScheduleWrite, loading, connectionError]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
