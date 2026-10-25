// Runs the shared contract suite against the memory adapter (plan chunk 7). The IndexedDB adapter runs it in chunk 9.
import { createMemoryStore } from '../memory/index';
import { runAdminCountContract } from './adminCount';
import { runContractSuite } from './suite';

runContractSuite('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));

runAdminCountContract('memory adapter', (options) => Promise.resolve(createMemoryStore(options)));
