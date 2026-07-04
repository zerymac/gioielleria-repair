/* AUDIT — mock di whatsapp-web.js: nessuna sessione reale, nessun messaggio inviato. */
class Client {
  constructor(opts) {
    Client.instance = this;
    this.opts = opts;
    this.handlers = {};
    this.sendMessage = jest.fn(async () => ({}));
    this.initialized = false;
  }
  on(evt, cb) { this.handlers[evt] = cb; return this; }
  initialize() { this.initialized = true; }
}
class LocalAuth { constructor(opts) { this.opts = opts; } }
module.exports = { Client, LocalAuth };
