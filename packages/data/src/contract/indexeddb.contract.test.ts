// Runs the shared contract suite against the IndexedDB adapter (plan chunk 9; BP-8).
import 'fake-indexeddb/auto';
import { createIndexedDbStore } from '../indexeddb/index';
import { runAuthoringFilesContract } from './authoringFiles';
import { runBillingContract } from './billing';
import { runAdminCountContract } from './adminCount';
import { runCompetitionsContract } from './competitions';
import { runEngagementContract } from './engagement';
import { runEvidenceFlowContract } from './evidenceFlow';
import { runFeedbackTicketsContract } from './feedbackTickets';
import { runIdentityOrgContract } from './identityOrg';
import { runPricingContract } from './pricing';
import { runOwnershipTransferContract } from './ownershipTransfer';
import { runProviderTeamContract } from './providerTeam';
import { runPackagingOptionContract } from './packagingOption';
import { runLearningContract } from './learning';
import { runM3FoundationContract } from './m3Foundation';
import { runExportsRetentionContract } from './exportsRetention';
import { runLeaderboardsThemesContract } from './leaderboardsThemes';
import { runRemindersLeftoversContract } from './remindersLeftovers';
import { runRulesRemindersContract } from './rulesReminders';
import { runContractSuite } from './suite';

let counter = 0;
// A fresh database name per store, so tests never see each other's data.
runContractSuite('indexeddb adapter', (options) => createIndexedDbStore(options, `contract-${String(counter++)}`));

runAdminCountContract('indexeddb adapter', (options) => createIndexedDbStore(options, `contract-${String(counter++)}`));

runLearningContract('indexeddb adapter', (options) => createIndexedDbStore(options, `contract-${String(counter++)}`));

runEngagementContract('indexeddb adapter', (options) => createIndexedDbStore(options, `contract-${String(counter++)}`));

runCompetitionsContract('indexeddb adapter', (options) =>
  createIndexedDbStore(options, `contract-${String(counter++)}`),
);

runM3FoundationContract('indexeddb adapter', (options) =>
  createIndexedDbStore(options, `contract-${String(counter++)}`),
);

runIdentityOrgContract('indexeddb adapter', (options) =>
  createIndexedDbStore(options, `contract-${String(counter++)}`),
);

runBillingContract('indexeddb adapter', (options) => createIndexedDbStore(options, `contract-${String(counter++)}`));

runAuthoringFilesContract('indexeddb adapter', (options) =>
  createIndexedDbStore(options, `contract-${String(counter++)}`),
);

runEvidenceFlowContract('indexeddb adapter', (options) =>
  createIndexedDbStore(options, `contract-${String(counter++)}`),
);

runFeedbackTicketsContract('indexeddb adapter', (options) =>
  createIndexedDbStore(options, `contract-${String(counter++)}`),
);

runRulesRemindersContract('indexeddb adapter', (options) =>
  createIndexedDbStore(options, `contract-${String(counter++)}`),
);

runLeaderboardsThemesContract('indexeddb adapter', (options) =>
  createIndexedDbStore(options, `contract-${String(counter++)}`),
);

runExportsRetentionContract('indexeddb adapter', (options) =>
  createIndexedDbStore(options, `contract-${String(counter++)}`),
);

runRemindersLeftoversContract('indexeddb adapter', (options) =>
  createIndexedDbStore(options, `contract-${String(counter++)}`),
);

runPricingContract('indexeddb adapter', (options) => createIndexedDbStore(options, `contract-${String(counter++)}`));
runOwnershipTransferContract('indexeddb adapter', (options) =>
  createIndexedDbStore(options, `contract-${String(counter++)}`),
);
runProviderTeamContract('indexeddb adapter', (options) =>
  createIndexedDbStore(options, `contract-${String(counter++)}`),
);
runPackagingOptionContract('indexeddb adapter', (options) =>
  createIndexedDbStore(options, `contract-${String(counter++)}`),
);
