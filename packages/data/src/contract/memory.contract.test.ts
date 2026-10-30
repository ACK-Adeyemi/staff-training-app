// Runs the shared contract suite against the memory adapter (plan chunk 7). The IndexedDB adapter runs it in chunk 9.
import { createMemoryStore } from '../memory/index';
import { runAuthoringFilesContract } from './authoringFiles';
import { runAiPracticeContract } from './aiPractice';
import { runAiDraftContract } from './aiDraft';
import { runBillingContract } from './billing';
import { runAdminCountContract } from './adminCount';
import { runCompetitionsContract } from './competitions';
import { runEngagementContract } from './engagement';
import { runEvidenceFlowContract } from './evidenceFlow';
import { runFeedbackTicketsContract } from './feedbackTickets';
import { runIdentityOrgContract } from './identityOrg';
import { runPricingContract } from './pricing';
import { runPriceNoticesContract } from './priceNotices';
import { runOwnershipTransferContract } from './ownershipTransfer';
import { runProviderTeamContract } from './providerTeam';
import { runCreateClientContract } from './createClient';
import { runProviderPublishContract } from './providerPublish';
import { runProviderCommsContract } from './providerComms';
import { runProviderIncidentsContract } from './providerIncidents';
import { runProviderGlobalAiContract } from './providerGlobalAi';
import { runProviderOverviewContract } from './providerOverview';
import { runProviderRecoveryContract } from './providerRecovery';
import { runProviderTicketsContract } from './providerTickets';
import { runPackagingOptionContract } from './packagingOption';
import { runDunningContract } from './dunning';
import { runLearningContract } from './learning';
import { runTranslatedModuleContract } from './translatedModule';
import { runM3FoundationContract } from './m3Foundation';
import { runExportsRetentionContract } from './exportsRetention';
import { runLeaderboardsThemesContract } from './leaderboardsThemes';
import { runRemindersLeftoversContract } from './remindersLeftovers';
import { runRulesRemindersContract } from './rulesReminders';
import { runContractSuite } from './suite';

runContractSuite('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runAdminCountContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runLearningContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
runTranslatedModuleContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runEngagementContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runCompetitionsContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runM3FoundationContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runIdentityOrgContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runBillingContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
runAiPracticeContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runAuthoringFilesContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runEvidenceFlowContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runFeedbackTicketsContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runRulesRemindersContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runLeaderboardsThemesContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runExportsRetentionContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runRemindersLeftoversContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runPricingContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
runPriceNoticesContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
runOwnershipTransferContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
runProviderTeamContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
runPackagingOptionContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
runDunningContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
runCreateClientContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
runProviderPublishContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
runProviderTicketsContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runProviderCommsContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
runProviderIncidentsContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runProviderRecoveryContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runProviderOverviewContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
runProviderGlobalAiContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
runAiDraftContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
