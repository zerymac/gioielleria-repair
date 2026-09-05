/* Netlify Function: /.netlify/functions/ai — proxy autenticato verso Claude.
   Env richieste su Netlify: ANTHROPIC_API_KEY, REACT_APP_SUPABASE_URL,
   REACT_APP_SUPABASE_KEY (le ultime due sono le stesse del build). */
const { handle } = require('../../server/aiCore');

exports.handler = async (event) => {
  const headers = event.headers || {};
  const bodyText = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const { status, body } = await handle({
    method: event.httpMethod,
    authorization: headers.authorization || headers.Authorization,
    bodyText,
  });
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body };
};
