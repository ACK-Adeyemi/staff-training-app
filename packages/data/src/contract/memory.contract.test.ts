// Runs the shared contract suite against the memory adapter (plan chunk 7). The IndexedDB adapter runs it in chunk 9.
import { createMemoryStore } from '../memory/index';
import { runAuthoringFilesContract } from './authoringFiles';
import { runBillingContract } from './billing';
import { runAdminCountContract } from './adminCount';
import { runCompetitionsContract } from './competitions';
import { runEngagementContract } from './engagement';
import { runEvidenceFlowContract } from './evidenceFlow';
import { runFeedbackTicketsContract } from './feedbackTickets';
import { runIdentityOrgContract } from './identityOrg';
import { runLearningContract } from './learning';
import { runM3FoundationContract } from './m3Foundation';
import { runRulesRemindersContract } from './rulesReminders';
import { runContractSuite } from './suite';

runContractSuite('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runAdminCountContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runLearningContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runEngagementContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runCompetitionsContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runM3FoundationContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runIdentityOrgContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runBillingContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runAuthoringFilesContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runEvidenceFlowContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runFeedbackTicketsContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runRulesRemindersContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
