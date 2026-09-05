/* Solo per `npm start` (dev server CRA): serve /.netlify/functions/ai con lo
   stesso codice della Function di produzione, così l'AI è provabile in locale
   senza Netlify CLI. In produzione questo file non finisce nel bundle. */
const { handle } = require('../server/aiCore');

module.exports = function (app) {
  app.post('/.netlify/functions/ai', (req, res) => {
    let bodyText = '';
    req.on('data', c => { bodyText += c; });
    req.on('end', async () => {
      const { status, body } = await handle({ method: 'POST', authorization: req.headers.authorization, bodyText });
      res.status(status).set('Content-Type', 'application/json').send(body);
    });
  });
};
