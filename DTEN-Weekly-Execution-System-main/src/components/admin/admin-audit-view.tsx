"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { addLocalAuditLog, createEmptyLocalOkrStore, loadLocalOkrStore, saveLocalOkrStore } from "@/lib/local-okr-store";
import { mergeById } from "@/lib/merge-by-id";
import { auditLogs, departments, quarters, teams, users } from "@/mock-data";
import { useMockSessionUser } from "@/lib/mock-session";
import type { AuditLog, ObjectiveLevel, UserRole, Visibility } from "@/types";

const allValue = "All";
const adminConfigStorageKey = "dten-weekly-execution-admin-config";
const actionTypes = [
  "admin_settings_updated",
  "okr_created",
  "okr_submitted_for_approval",
  "objective_approved",
  "objective_rejected",
  "visibility_changed",
  "manager_assignment_changed",
  "role_changed",
  "quarter_archived",
  "contribution_link_created",
  "contribution_link_removed",
  "admin_override_placeholder",
];
const targetTypes = ["objective", "key_result", "user", "quarter"];
const userRoles: UserRole[] = ["Employee", "Manager", "Leadership", "Admin"];
const objectiveLevels: ObjectiveLevel[] = ["company", "department", "team", "individual"];
const visibilityOptions: Visibility[] = ["Company-wide", "Leadership-only", "Team-only", "Manager visibility", "Private to owner + manager"];
const prototypeActions: Array<{ actionType: string; targetType: string; targetId: string; metadata: AuditLog["metadata"] }> = [
  { actionType: "manager_assignment_changed", targetType: "user", targetId: "u-lena", metadata: { from: "u-jordan", to: "u-mina", placeholder: true } },
  { actionType: "role_changed", targetType: "user", targetId: "u-nora", metadata: { from: "Employee", to: "Manager", placeholder: true } },
  { actionType: "quarter_archived", targetType: "quarter", targetId: "q2-2026", metadata: { placeholder: true } },
  { actionType: "admin_override_placeholder", targetType: "objective", targetId: "obj-company-launch", metadata: { reason: "Prototype override" } },
];

type AdminConfig = {
  departments: Array<{ id: string; name: string; ownerUserId: string }>;
  teams: Array<{ id: string; name: string; departmentId: string; leaderUserId: string }>;
  users: Array<{
    id: string;
    role: UserRole;
    departmentId: string;
    teamId: string;
    primaryManagerId: string;
    localManagerId: string;
  }>;
  visibilityDefaults: Record<ObjectiveLevel, Visibility>;
  activeQuarterId: string;
  archivedQuarterIds: string[];
  eligibleOwners: Record<ObjectiveLevel, string>;
  crossTeamVisibilityGroups: Array<{ id: string; viewerTeamId: string; targetTeamId: string }>;
};

export function AdminAuditView() {
  const activeUser = useMockSessionUser();
  const [store, setStore] = useState(() => createEmptyLocalOkrStore());
  const [actorId, setActorId] = useState(allValue);
  const [actionType, setActionType] = useState(allValue);
  const [targetType, setTargetType] = useState(allValue);
  const [date, setDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [adminConfig, setAdminConfig] = useState<AdminConfig>(() => createDefaultAdminConfig());

  useEffect(() => {
    const refreshStore = () => setStore(loadLocalOkrStore());
    refreshStore();
    setAdminConfig(loadAdminConfig());
    window.addEventListener("dten-local-okrs-updated", refreshStore);

    return () => window.removeEventListener("dten-local-okrs-updated", refreshStore);
  }, []);

  const mergedAuditLogs = useMemo(() => {
    return mergeById(auditLogs, store.auditLogs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [store.auditLogs]);
  const filteredAuditLogs = mergedAuditLogs.filter((auditLog) => {
    return (
      (actorId === allValue || auditLog.actorUserId === actorId) &&
      (actionType === allValue || auditLog.actionType === actionType) &&
      (targetType === allValue || auditLog.targetType === targetType) &&
      (!date || auditLog.createdAt.slice(0, 10) === date)
    );
  });

  function createPrototypeAuditLog(action: (typeof prototypeActions)[number]) {
    const timestamp = new Date().toISOString();
    const auditLog: AuditLog = {
      id: `local-audit-${crypto.randomUUID()}`,
      actorUserId: activeUser.id,
      actionType: action.actionType,
      targetType: action.targetType,
      targetId: action.targetId,
      metadata: action.metadata,
      createdAt: timestamp,
    };
    const nextStore = addLocalAuditLog(loadLocalOkrStore(), auditLog);
    saveLocalOkrStore(nextStore);
    setStore(nextStore);
    setMessage(`${formatAction(action.actionType)} audit event created.`);
  }

  function saveAdminSection(actionType: string, targetType: string, targetId: string, metadata: AuditLog["metadata"]) {
    const timestamp = new Date().toISOString();
    const auditLog: AuditLog = {
      id: `local-audit-${crypto.randomUUID()}`,
      actorUserId: activeUser.id,
      actionType,
      targetType,
      targetId,
      metadata,
      createdAt: timestamp,
    };
    window.localStorage.setItem(adminConfigStorageKey, JSON.stringify(adminConfig));
    const nextStore = addLocalAuditLog(loadLocalOkrStore(), auditLog);
    saveLocalOkrStore(nextStore);
    setStore(nextStore);
    setMessage(`${formatAction(actionType)} saved.`);
  }

  function updateDepartment(id: string, updates: Partial<AdminConfig["departments"][number]>) {
    setAdminConfig((config) => ({ ...config, departments: config.departments.map((department) => (department.id === id ? { ...department, ...updates } : department)) }));
  }

  function updateTeam(id: string, updates: Partial<AdminConfig["teams"][number]>) {
    setAdminConfig((config) => ({ ...config, teams: config.teams.map((team) => (team.id === id ? { ...team, ...updates } : team)) }));
  }

  function updateUser(id: string, updates: Partial<AdminConfig["users"][number]>) {
    setAdminConfig((config) => ({ ...config, users: config.users.map((user) => (user.id === id ? { ...user, ...updates } : user)) }));
  }

  function updateVisibilityDefault(level: ObjectiveLevel, visibility: Visibility) {
    setAdminConfig((config) => ({ ...config, visibilityDefaults: { ...config.visibilityDefaults, [level]: visibility } }));
  }

  function updateEligibleOwner(level: ObjectiveLevel, userId: string) {
    setAdminConfig((config) => ({ ...config, eligibleOwners: { ...config.eligibleOwners, [level]: userId } }));
  }

  function addCrossTeamVisibilityGroup() {
    const firstTeam = teams[0]?.id ?? "";
    setAdminConfig((config) => ({
      ...config,
      crossTeamVisibilityGroups: [
        ...config.crossTeamVisibilityGroups,
        { id: `local-cross-team-${crypto.randomUUID()}`, viewerTeamId: firstTeam, targetTeamId: firstTeam },
      ],
    }));
  }

  function updateCrossTeamVisibilityGroup(id: string, updates: Partial<AdminConfig["crossTeamVisibilityGroups"][number]>) {
    setAdminConfig((config) => ({
      ...config,
      crossTeamVisibilityGroups: config.crossTeamVisibilityGroups.map((group) => (group.id === id ? { ...group, ...updates } : group)),
    }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin"
        description="Lightweight audit log for governance and support. This is not an advanced compliance or export system."
        actions={<Badge tone={activeUser.role === "Admin" ? "info" : "warning"}>{activeUser.role} view</Badge>}
      />

      {message ? <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-dten-blue">{message}</div> : null}

      <AdminSettingsPanel
        adminConfig={adminConfig}
        updateDepartment={updateDepartment}
        updateTeam={updateTeam}
        updateUser={updateUser}
        updateVisibilityDefault={updateVisibilityDefault}
        updateEligibleOwner={updateEligibleOwner}
        setAdminConfig={setAdminConfig}
        addCrossTeamVisibilityGroup={addCrossTeamVisibilityGroup}
        updateCrossTeamVisibilityGroup={updateCrossTeamVisibilityGroup}
        saveAdminSection={saveAdminSection}
      />

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink-950">Filters</h2>
          <p className="mt-1 text-sm text-ink-600">Filter by actor, action type, target type, and exact event date.</p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SelectField label="Actor" value={actorId} onChange={setActorId}>
            <option>{allValue}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Action type" value={actionType} onChange={setActionType}>
            <option>{allValue}</option>
            {actionTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </SelectField>
          <SelectField label="Target type" value={targetType} onChange={setTargetType}>
            <option>{allValue}</option>
            {targetTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </SelectField>
          <label className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">Date</span>
            <input
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-ink-800 outline-none focus:border-dten-blue"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink-950">Audit Log</h2>
            <Badge tone="neutral">{filteredAuditLogs.length} events</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {filteredAuditLogs.length === 0 ? (
            <EmptyState title="No audit events" description="No events match the selected filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-ink-600">
                  <tr>
                    <th className="py-2 pr-4">Created</th>
                    <th className="py-2 pr-4">Actor</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Target</th>
                    <th className="py-2 pr-4">Metadata JSON</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAuditLogs.map((auditLog) => (
                    <tr key={auditLog.id}>
                      <td className="py-3 pr-4 text-ink-600">{formatDateTime(auditLog.createdAt)}</td>
                      <td className="py-3 pr-4 font-semibold text-ink-950">{getUserName(auditLog.actorUserId)}</td>
                      <td className="py-3 pr-4">
                        <Badge tone="info">{formatAction(auditLog.actionType)}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-ink-600">
                        {auditLog.targetType} / {auditLog.targetId}
                      </td>
                      <td className="max-w-md py-3 pr-4 font-mono text-xs text-ink-600">{JSON.stringify(auditLog.metadata)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink-950">Mock Admin Events</h2>
          <p className="mt-1 text-sm text-ink-600">Prototype-only buttons represent admin changes that do not have full management screens yet.</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {prototypeActions.map((action) => (
            <Button key={action.actionType} variant="secondary" onClick={() => createPrototypeAuditLog(action)}>
              Log {formatAction(action.actionType)}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AdminSettingsPanel({
  adminConfig,
  updateDepartment,
  updateTeam,
  updateUser,
  updateVisibilityDefault,
  updateEligibleOwner,
  setAdminConfig,
  addCrossTeamVisibilityGroup,
  updateCrossTeamVisibilityGroup,
  saveAdminSection,
}: {
  adminConfig: AdminConfig;
  updateDepartment: (id: string, updates: Partial<AdminConfig["departments"][number]>) => void;
  updateTeam: (id: string, updates: Partial<AdminConfig["teams"][number]>) => void;
  updateUser: (id: string, updates: Partial<AdminConfig["users"][number]>) => void;
  updateVisibilityDefault: (level: ObjectiveLevel, visibility: Visibility) => void;
  updateEligibleOwner: (level: ObjectiveLevel, userId: string) => void;
  setAdminConfig: React.Dispatch<React.SetStateAction<AdminConfig>>;
  addCrossTeamVisibilityGroup: () => void;
  updateCrossTeamVisibilityGroup: (id: string, updates: Partial<AdminConfig["crossTeamVisibilityGroups"][number]>) => void;
  saveAdminSection: (actionType: string, targetType: string, targetId: string, metadata: AuditLog["metadata"]) => void;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink-950">Organization Settings</h2>
          <p className="mt-1 text-sm text-ink-600">Prototype-local departments/functions, teams, and user membership. One department, one team, and one primary manager per user.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-2">
            <SettingsSection
              title="Departments/functions"
              actionLabel="Save departments/functions"
              onSave={() => saveAdminSection("admin_settings_updated", "org_config", "departments", { section: "departments" })}
            >
              {adminConfig.departments.map((department) => (
                <div key={department.id} className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_220px]">
                  <TextField label="Name" value={department.name} onChange={(value) => updateDepartment(department.id, { name: value })} />
                  <UserSelect label="Owner" value={department.ownerUserId} onChange={(value) => updateDepartment(department.id, { ownerUserId: value })} />
                </div>
              ))}
            </SettingsSection>

            <SettingsSection
              title="Teams"
              actionLabel="Save teams"
              onSave={() => saveAdminSection("admin_settings_updated", "org_config", "teams", { section: "teams" })}
            >
              {adminConfig.teams.map((team) => (
                <div key={team.id} className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-2">
                  <TextField label="Name" value={team.name} onChange={(value) => updateTeam(team.id, { name: value })} />
                  <DepartmentSelect label="Department/function" value={team.departmentId} onChange={(value) => updateTeam(team.id, { departmentId: value })} />
                  <UserSelect label="Leader" value={team.leaderUserId} onChange={(value) => updateTeam(team.id, { leaderUserId: value })} />
                </div>
              ))}
            </SettingsSection>
          </div>

          <SettingsSection
            title="Users, roles, and managers"
            actionLabel="Save users"
            onSave={() => saveAdminSection("role_changed", "user", "mock-users", { section: "users", includesManagerAssignments: true, prototype: true })}
          >
            <div className="space-y-3">
              {adminConfig.users.map((userConfig) => {
                const user = users.find((item) => item.id === userConfig.id);
                return (
                  <div key={userConfig.id} className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-2 xl:grid-cols-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">User</p>
                      <p className="mt-2 text-sm font-semibold text-ink-950">{user?.name ?? userConfig.id}</p>
                    </div>
                    <SelectField label="Role" value={userConfig.role} onChange={(value) => updateUser(userConfig.id, { role: value as UserRole })}>
                      {userRoles.map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </SelectField>
                    <DepartmentSelect label="Department/function" value={userConfig.departmentId} onChange={(value) => updateUser(userConfig.id, { departmentId: value })} />
                    <TeamSelect label="Team" value={userConfig.teamId} onChange={(value) => updateUser(userConfig.id, { teamId: value })} />
                    <UserSelect label="Primary manager" value={userConfig.primaryManagerId} onChange={(value) => updateUser(userConfig.id, { primaryManagerId: value })} includeNone />
                    <UserSelect label="Local manager" value={userConfig.localManagerId} onChange={(value) => updateUser(userConfig.id, { localManagerId: value })} includeNone />
                  </div>
                );
              })}
            </div>
          </SettingsSection>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-ink-950">OKR Policy Settings</h2>
          <p className="mt-1 text-sm text-ink-600">Simple mock defaults for visibility, quarters, eligible OKR owners, and team/function-level visibility.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-2">
            <SettingsSection
              title="Visibility defaults"
              actionLabel="Save visibility defaults"
              onSave={() => saveAdminSection("visibility_changed", "org_config", "visibility-defaults", { section: "visibilityDefaults" })}
            >
              <div className="grid gap-3 md:grid-cols-2">
                {objectiveLevels.map((level) => (
                  <SelectField key={level} label={`${level} OKRs`} value={adminConfig.visibilityDefaults[level]} onChange={(value) => updateVisibilityDefault(level, value as Visibility)}>
                    {visibilityOptions.map((visibility) => (
                      <option key={visibility}>{visibility}</option>
                    ))}
                  </SelectField>
                ))}
              </div>
            </SettingsSection>

            <SettingsSection
              title="Active and archived quarters"
              actionLabel="Save quarter settings"
              onSave={() => saveAdminSection("quarter_archived", "quarter", "mock-quarters", { activeQuarterId: adminConfig.activeQuarterId, archivedQuarterIds: adminConfig.archivedQuarterIds.join(",") })}
            >
              <SelectField label="Active quarter" value={adminConfig.activeQuarterId} onChange={(value) => setAdminConfig((config) => ({ ...config, activeQuarterId: value }))}>
                {quarters.map((quarter) => (
                  <option key={quarter.id} value={quarter.id}>
                    {quarter.label}
                  </option>
                ))}
              </SelectField>
              <div className="grid gap-2 md:grid-cols-2">
                {quarters.map((quarter) => (
                  <label key={quarter.id} className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      checked={adminConfig.archivedQuarterIds.includes(quarter.id)}
                      onChange={(event) =>
                        setAdminConfig((config) => ({
                          ...config,
                          archivedQuarterIds: event.target.checked
                            ? [...config.archivedQuarterIds, quarter.id]
                            : config.archivedQuarterIds.filter((id) => id !== quarter.id),
                        }))
                      }
                    />
                    Archived: {quarter.label}
                  </label>
                ))}
              </div>
            </SettingsSection>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SettingsSection
              title="Eligible owners"
              actionLabel="Save owner eligibility"
              onSave={() => saveAdminSection("admin_settings_updated", "org_config", "eligible-owners", { section: "eligibleOwners" })}
            >
              <div className="grid gap-3 md:grid-cols-2">
                {objectiveLevels.map((level) => (
                  <UserSelect key={level} label={`${level} OKR owners`} value={adminConfig.eligibleOwners[level]} onChange={(value) => updateEligibleOwner(level, value)} />
                ))}
              </div>
            </SettingsSection>

            <SettingsSection
              title="Cross-team visibility groups"
              actionLabel="Save cross-team visibility"
              onSave={() => saveAdminSection("admin_settings_updated", "org_config", "cross-team-visibility", { section: "crossTeamVisibilityGroups" })}
              secondaryAction={<Button variant="ghost" onClick={addCrossTeamVisibilityGroup}>Add group</Button>}
            >
              <div className="space-y-3">
                {adminConfig.crossTeamVisibilityGroups.map((group) => (
                  <div key={group.id} className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-2">
                    <TeamSelect label="Viewer team/function" value={group.viewerTeamId} onChange={(value) => updateCrossTeamVisibilityGroup(group.id, { viewerTeamId: value })} />
                    <TeamSelect label="Can see team/function" value={group.targetTeamId} onChange={(value) => updateCrossTeamVisibilityGroup(group.id, { targetTeamId: value })} />
                  </div>
                ))}
              </div>
            </SettingsSection>
          </div>

          <SettingsSection
            title="Admin override"
            actionLabel="Log prototype override"
            onSave={() => saveAdminSection("admin_override_placeholder", "org_config", "prototype-override", { reason: "Prototype-only override control" })}
          >
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-dten-amber">
              Admin override is limited to a labeled prototype audit event. It does not bypass permissions or mutate production-style data.
            </div>
          </SettingsSection>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsSection({
  title,
  actionLabel,
  onSave,
  children,
  secondaryAction,
}: {
  title: string;
  actionLabel: string;
  onSave: () => void;
  children: React.ReactNode;
  secondaryAction?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-950">{title}</h3>
        <div className="flex flex-wrap gap-2">
          {secondaryAction}
          <Button variant="secondary" onClick={onSave}>{actionLabel}</Button>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-ink-800 outline-none focus:border-dten-blue"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-600">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-ink-800 outline-none focus:border-dten-blue"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function UserSelect({ label, value, onChange, includeNone = false }: { label: string; value: string; onChange: (value: string) => void; includeNone?: boolean }) {
  return (
    <SelectField label={label} value={value} onChange={onChange}>
      {includeNone ? <option value="">None</option> : null}
      {users.map((user) => (
        <option key={user.id} value={user.id}>
          {user.name}
        </option>
      ))}
    </SelectField>
  );
}

function DepartmentSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <SelectField label={label} value={value} onChange={onChange}>
      {departments.map((department) => (
        <option key={department.id} value={department.id}>
          {department.name}
        </option>
      ))}
    </SelectField>
  );
}

function TeamSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <SelectField label={label} value={value} onChange={onChange}>
      {teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      ))}
    </SelectField>
  );
}

function createDefaultAdminConfig(): AdminConfig {
  return {
    departments: departments.map((department) => ({ id: department.id, name: department.name, ownerUserId: department.ownerUserId })),
    teams: teams.map((team) => ({ id: team.id, name: team.name, departmentId: team.departmentId, leaderUserId: team.leaderUserId })),
    users: users.map((user) => ({
      id: user.id,
      role: user.role,
      departmentId: user.departmentId,
      teamId: user.teamId,
      primaryManagerId: user.primaryManagerId ?? "",
      localManagerId: user.localManagerId ?? "",
    })),
    visibilityDefaults: {
      company: "Company-wide",
      department: "Company-wide",
      team: "Team-only",
      individual: "Manager visibility",
    },
    activeQuarterId: quarters.find((quarter) => quarter.isActive)?.id ?? quarters[0]?.id ?? "",
    archivedQuarterIds: quarters.filter((quarter) => quarter.archived).map((quarter) => quarter.id),
    eligibleOwners: {
      company: users.find((user) => user.role === "Leadership")?.id ?? users[0]?.id ?? "",
      department: departments[0]?.ownerUserId ?? users[0]?.id ?? "",
      team: teams[0]?.leaderUserId ?? users[0]?.id ?? "",
      individual: users[0]?.id ?? "",
    },
    crossTeamVisibilityGroups: [{ id: "cross-team-product-engineering", viewerTeamId: "team-product-experience", targetTeamId: "team-platform" }],
  };
}

function loadAdminConfig() {
  if (typeof window === "undefined") {
    return createDefaultAdminConfig();
  }

  const rawValue = window.localStorage.getItem(adminConfigStorageKey);
  if (!rawValue) {
    return createDefaultAdminConfig();
  }

  try {
    return { ...createDefaultAdminConfig(), ...(JSON.parse(rawValue) as Partial<AdminConfig>) };
  } catch {
    return createDefaultAdminConfig();
  }
}

function getUserName(userId: string) {
  return users.find((user) => user.id === userId)?.name ?? userId;
}

function formatAction(actionType: string) {
  return actionType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
