// AUDIT — setup globale test: blocca OGNI rete reale e stub API browser mancanti in jsdom.
import '@testing-library/jest-dom';

// fetch: mock che registra le chiamate e RIFIUTA (nessuna rete reale).
// I test che devono osservare payload usano fetch.mock.calls; i percorsi
// fire-and-forget dell'app assorbono il reject nei .catch (comportamento reale a server spento).
beforeEach(() => {
  global.fetch = jest.fn((url) => Promise.reject(new Error('AUDIT: rete bloccata → ' + url)));
  window.open = jest.fn(() => null);
  window.alert = jest.fn();
  window.confirm = jest.fn(() => true);
});

// jsdom non implementa Blob/File.text(): polyfill per i test di import backup/vCard
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function () {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsText(this);
    });
  };
}

if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:audit-fake';
if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = () => {};

// crypto per linkToken/quote token (jsdom può non averlo completo)
const nodeCrypto = require('crypto');
if (!global.crypto) global.crypto = {};
if (!global.crypto.getRandomValues) global.crypto.getRandomValues = (arr) => nodeCrypto.randomFillSync(arr);
if (!global.crypto.randomUUID) global.crypto.randomUUID = () => nodeCrypto.randomUUID();

jest.setTimeout(30000);
