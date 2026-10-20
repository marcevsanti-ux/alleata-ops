/*
 * agent-auth.js — el portal ya NO lleva el secreto del agente.
 *
 * Todo fetch hacia el agente de Railway sale con el token de sesión de Supabase del usuario logueado
 * (Authorization: Bearer ...). El servidor (alleata-agent, authMiddleware.bridgeBearerToService) lo valida y completa
 * internamente x-automation-secret. Cualquier header x-automation-secret que todavía quede en el código de una pantalla
 * se descarta acá antes de salir.
 *
 * Incluir en cada página ANTES de su script principal:  <script src="agent-auth.js"></script>
 */
(function () {
  if (window.__agentAuthInstalled) return;
  window.__agentAuthInstalled = true;
  var AGENT = /alleata-agent-production\.up\.railway\.app/;

  // El token vive en localStorage (supabase-js lo guarda y lo renueva solo): clave sb-<proyecto>-auth-token.
  function token() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.+-auth-token$/.test(k)) {
          var v = JSON.parse(localStorage.getItem(k) || 'null');
          var t = v && (v.access_token || (v.currentSession && v.currentSession.access_token));
          if (t) return t;
        }
      }
    } catch (e) { /* sin storage: el servidor responderá 401 */ }
    return '';
  }

  var orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (AGENT.test(url)) {
        init = Object.assign({}, init || {});
        var h = new Headers(init.headers || (typeof input !== 'string' && input && input.headers) || {});
        h.delete('x-automation-secret');
        var a = h.get('Authorization');
        if (!a || /^Bearer\s*(undefined|null)?\s*$/i.test(a)) {
          var t = token();
          if (t) h.set('Authorization', 'Bearer ' + t);
        }
        init.headers = h;
      }
    } catch (e) { /* ante cualquier duda, el request sale tal cual */ }
    return orig(input, init);
  };
})();
