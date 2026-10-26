// Runs the shared contract suite against the IndexedDB adapter (plan chunk 9; BP-8).
import 'fake-indexeddb/auto';
import { createIndexedDbStore } from '../indexeddb/index';
import { runAdminCountContract } from './adminCount';
import { runCompetitionsContract } from './competitions';
import { runEngagementContract } from './engagement';
import { runLearningContract } from './learning';
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
