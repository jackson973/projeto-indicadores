/**
 * Helper para mockar o módulo db/connection.js nos testes.
 *
 * Uso:
 *   const { mockQuery, mockGetClient, resetMock } = require('./helpers/mockDb');
 *
 * Antes de importar qualquer repository, injete o mock no require.cache:
 *   const connectionPath = require.resolve('../../src/db/connection');
 *   require.cache[connectionPath] = { id: connectionPath, filename: connectionPath, loaded: true, exports: mockDb };
 *
 * Depois importe o repository normalmente.
 */

let queryResults = [];
let queryCallIndex = 0;
const queryCalls = [];

const clientQueryResults = [];
let clientQueryCallIndex = 0;
const clientQueryCalls = [];

const mockQuery = async (text, params) => {
  queryCalls.push({ text, params });
  const result = queryResults[queryCallIndex] || { rows: [], rowCount: 0 };
  queryCallIndex++;
  return result;
};

const mockClientQuery = async (text, params) => {
  clientQueryCalls.push({ text, params });
  const result = clientQueryResults[clientQueryCallIndex] || { rows: [], rowCount: 0 };
  clientQueryCallIndex++;
  return result;
};

const mockClient = {
  query: mockClientQuery,
  release: () => {}
};

const mockGetClient = async () => mockClient;

const mockDb = {
  query: mockQuery,
  getClient: mockGetClient,
  pool: {}
};

function setQueryResults(results) {
  queryResults = results;
  queryCallIndex = 0;
}

function setClientQueryResults(results) {
  clientQueryResults.length = 0;
  clientQueryResults.push(...results);
  clientQueryCallIndex = 0;
}

function resetMock() {
  queryResults = [];
  queryCallIndex = 0;
  queryCalls.length = 0;
  clientQueryResults.length = 0;
  clientQueryCallIndex = 0;
  clientQueryCalls.length = 0;
}

function getQueryCalls() {
  return queryCalls;
}

function getClientQueryCalls() {
  return clientQueryCalls;
}

module.exports = {
  mockDb,
  mockQuery,
  mockGetClient,
  setQueryResults,
  setClientQueryResults,
  resetMock,
  getQueryCalls,
  getClientQueryCalls
};
