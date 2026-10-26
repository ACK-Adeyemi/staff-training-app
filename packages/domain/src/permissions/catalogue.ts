// Permission catalogues and provider system roles. Build pack section 6, brief 22.3 to 22.5.
// Placeholders: M4 refines the provider list.
import type { Permission, SystemRoleKey } from '../schemas/access';

type Entry = readonly [id: string, description: string, opts?: { sensitive?: boolean; requires?: string[] }];

const build = (entries: readonly Entry[]): Permission[] =>
  entries.map(([id, description, opts]) => {
    const dot = id.indexOf('.');
    return {
      id,
      area: id.slice(0, dot),
      action: id.slice(dot + 1),
      description,
      sensitive: opts?.sensitive ?? false,
      requires: opts?.requires ?? [],
    };
  });

const S = { sensitive: true };

export const clientCatalogue: Permission[] = build([
  ['staff.view', 'See staff, teams and sites'],
  ['staff.manage', 'Add and edit staff, teams and sites', { requires: ['staff.view'] }],
  ['staff.delete', 'Delete staff records', { ...S, requires: ['staff.manage'] }],
  ['team.manageRoles', 'Manage who can do what', S],
  ['evidence.view', 'See evidence and certificates'],
  ['evidence.uploadForOthers', 'Upload evidence for other people', { requires: ['evidence.view'] }],
  ['evidence.approve', 'Approve evidence', { ...S, requires: ['evidence.view'] }],
  ['assign.view', 'See assigned training'],
  ['assign.manage', 'Assign training', { requires: ['assign.view'] }],
  ['modules.view', 'See modules'],
  ['modules.manage', 'Edit modules', { requires: ['modules.view'] }],
  ['modules.addLinks', 'Add links to modules', { requires: ['modules.view'] }],
  ['reports.view', 'See reports'],
  ['reports.export', 'Export reports and records', { ...S, requires: ['reports.view'] }],
  ['competitions.view', 'See competitions'],
  ['competitions.manage', 'Run competitions', { requires: ['competitions.view'] }],
  ['battles.host', 'Host Battle Rooms', { requires: ['competitions.view'] }],
  ['themes.view', 'See themes'],
  ['themes.manage', 'Edit themes', { requires: ['themes.view'] }],
  ['reminders.view', 'See reminders'],
  ['reminders.manage', 'Edit reminders', { requires: ['reminders.view'] }],
  ['settings.view', 'See settings'],
  ['settings.manage', 'Change settings', { requires: ['settings.view'] }],
  ['org.editName', 'Change the organisation name', { requires: ['settings.manage'] }],
  ['billing.view', 'See billing', S],
  ['billing.manage', 'Manage billing', { ...S, requires: ['billing.view'] }],
  ['support.raise', 'Raise support tickets'],
  ['support.viewOrgTickets', "See everyone's support tickets", { requires: ['support.raise'] }],
  ['support.allowStaffTickets', 'Let staff raise tickets', { requires: ['support.raise'] }],
  ['moduleFeedback.view', 'See module feedback'],
  ['moduleFeedback.respond', 'Respond to module feedback', { requires: ['moduleFeedback.view'] }],
]);

export const providerCatalogue: Permission[] = build([
  ['clients.read', 'See client accounts'],
  ['clients.write', 'Edit client accounts', { requires: ['clients.read'] }],
  ['clients.delete', 'Delete client accounts', { ...S, requires: ['clients.write'] }],
  ['clients.viewPersonalRecords', 'See personal records inside a client', { ...S, requires: ['clients.read'] }],
  ['clients.viewAs', 'View as a client (audited)', { ...S, requires: ['clients.read'] }],
  ['clients.reviewNameChanges', 'Review organisation name changes', { requires: ['clients.read'] }],
  ['clients.revertDisplayName', 'Revert a display name', { ...S, requires: ['clients.reviewNameChanges'] }],
  ['clients.editBilling', "Edit a client's billing details", { ...S, requires: ['clients.write', 'billing.read'] }],
  ['content.read', 'See content'],
  ['content.write', 'Edit content', { requires: ['content.read'] }],
  ['content.publishAll', 'Publish content to all clients', { ...S, requires: ['content.write'] }],
  ['packs.read', 'See industry packs'],
  ['packs.write', 'Edit industry packs', { requires: ['packs.read'] }],
  ['billing.read', 'See billing'],
  ['billing.write', 'Edit billing', { requires: ['billing.read'] }],
  ['billing.draftPriceChanges', 'Draft price changes', { requires: ['billing.write'] }],
  ['billing.confirmPriceChanges', 'Confirm price changes', { ...S, requires: ['billing.draftPriceChanges'] }],
  ['billing.applyCredits', 'Apply credits', { ...S, requires: ['billing.write'] }],
  ['billing.export', 'Export billing data', { ...S, requires: ['billing.read'] }],
  ['ops.read', 'See operations'],
  ['ops.write', 'Change operations settings', { requires: ['ops.read'] }],
  ['feedback.read', 'See feedback'],
  ['feedback.write', 'Respond to feedback', { requires: ['feedback.read'] }],
  ['comms.send', 'Send messages to a client'],
  ['comms.sendAll', 'Send messages to all clients', { ...S, requires: ['comms.send'] }],
  ['recovery.start', 'Start account recovery'],
  ['recovery.approve', 'Approve account recovery', { ...S, requires: ['recovery.start'] }],
  ['dataRequests.manage', 'Handle data requests', S],
  ['incidents.post', 'Post incident notices'],
  ['incidents.postAll', 'Post incident notices to all clients', { ...S, requires: ['incidents.post'] }],
  ['tickets.read', 'See tickets'],
  ['tickets.write', 'Respond to tickets', { requires: ['tickets.read'] }],
  ['tickets.viewAttachments', 'See ticket attachments', { ...S, requires: ['tickets.read'] }],
  ['ai.manage', 'Manage the AI assistant'],
  ['team.read', 'See the provider team'],
  ['team.manage', 'Manage the provider team', { requires: ['team.read'] }],
  ['roles.manage', 'Manage provider roles', S],
  ['team.reset2fa', 'Reset two-factor sign-in', { ...S, requires: ['team.manage'] }],
  ['audit.read', 'See the audit log'],
  ['audit.export', 'Export the audit log', { ...S, requires: ['audit.read'] }],
  ['security.manage', 'Manage security settings', S],
  ['system.flags', 'Change system flags', S],
  ['owner.transfer', 'Transfer ownership', S],
  ['owner.deleteAccount', 'Delete the provider account', S],
  ['owner.manageOwnerRoles', 'Manage Owner and Co-Owner roles', S],
]);

const requiresOf = new Map([...clientCatalogue, ...providerCatalogue].map((p) => [p.id, p.requires]));

/** Adds every transitive requirement, so a template never holds a permission without its prerequisites. */
const closed = (ids: string[]): string[] => {
  const out = new Set<string>();
  const add = (id: string): void => {
    if (out.has(id)) return;
    out.add(id);
    for (const r of requiresOf.get(id) ?? []) add(r);
  };
  ids.forEach(add);
  return [...out];
};

const providerIds = providerCatalogue.map((p) => p.id);
const reads = providerIds.filter((id) => id.endsWith('.read'));

export type ProviderRoleTemplate = {
  key: string;
  systemKey: SystemRoleKey;
  name: string;
  description: string;
  permissionIds: string[];
};

export const providerRoleTemplates: ProviderRoleTemplate[] = [
  { key: 'owner', systemKey: 'providerOwner', name: 'Owner', description: 'Everything', permissionIds: providerIds },
  {
    key: 'coOwner',
    systemKey: 'providerCoOwner',
    name: 'Co-Owner',
    description: 'Everything except owner-only actions',
    permissionIds: providerIds.filter((id) => !id.startsWith('owner.')),
  },
  {
    key: 'admin',
    systemKey: 'providerAdmin',
    name: 'Admin',
    description: 'Runs client accounts, content and support',
    permissionIds: closed([
      'clients.write',
      'clients.reviewNameChanges',
      'content.write',
      'packs.write',
      'ops.write',
      'feedback.write',
      'comms.send',
      'incidents.post',
      'tickets.write',
      'team.read',
      'audit.read',
      'billing.read',
    ]),
  },
  {
    key: 'support',
    systemKey: 'providerSupport',
    name: 'Support',
    description: 'Answers tickets and helps clients',
    permissionIds: closed([
      'clients.read',
      'tickets.write',
      'feedback.write',
      'comms.send',
      'recovery.start',
      'incidents.post',
    ]),
  },
  {
    key: 'billing',
    systemKey: 'providerBilling',
    name: 'Billing',
    description: 'Looks after billing',
    permissionIds: closed([
      'clients.read',
      'billing.write',
      'billing.draftPriceChanges',
      'billing.export',
      'clients.editBilling',
    ]),
  },
  {
    key: 'contentEditor',
    systemKey: 'providerContentEditor',
    name: 'Content Editor',
    description: 'Writes and edits content and packs',
    permissionIds: closed(['content.write', 'packs.write', 'feedback.read']),
  },
  {
    key: 'readOnly',
    systemKey: 'providerReadOnly',
    name: 'Read-only',
    description: 'Can look but not change',
    permissionIds: reads,
  },
];
