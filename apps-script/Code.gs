/**
 * Controle de Ponto — backend (Google Apps Script).
 *
 * Fluxo: uma página envia  ?nome=...&acao=...  para o Web App -> o registro é gravado na
 * planilha -> o colaborador recebe um comprovante -> o gestor recebe UM resumo por dia.
 *
 * Configure em "Configurações do projeto > Propriedades do script" (nada fica no código):
 *   ID_PLANILHA      (opcional) ID da planilha. Vazio = planilha à qual o script está vinculado
 *   EMAIL_COLABORADOR  e-mail que recebe o comprovante de cada batida
 *   EMAIL_GESTOR       e-mail que recebe o resumo diário
 *   NOME_ORGANIZACAO   nome exibido nos e-mails (opcional)
 */
var VERSAO = 'v1.0';
var ACOES_VALIDAS = ['Entrada', 'Saída para almoço', 'Retorno do almoço', 'Saída'];
var ABA = 'Ponto';
var JANELA_DUPLICADO_SEG = 90;      // mesma ação/nome dentro desse prazo = ignorada
var JANELA_REPETIDA_MIN = 3;        // batidas iguais com menos de N min viram uma só no resumo

function cfg_(chave, padrao) {
  var v = PropertiesService.getScriptProperties().getProperty(chave);
  return v ? String(v).trim() : (padrao || '');
}
function tz_() { return Session.getScriptTimeZone(); }

function planilha_() {
  var id = cfg_('ID_PLANILHA');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function aba_() {
  var ss = planilha_();
  var aba = ss.getSheetByName(ABA);
  if (!aba) {
    aba = ss.insertSheet(ABA);
    aba.appendRow(['Data', 'Hora', 'Nome', 'Ação', 'Timestamp']);
    aba.getRange(1, 1, 1, 5).setFontWeight('bold');
  }
  return aba;
}

// ---- e-mail: o gestor só recebe o RESUMO; o comprovante vai só ao colaborador ----
function enviarEmail_(destino, assunto, corpoTxt, corpoHtml, tipo) {
  var dest = String(destino || '').trim().toLowerCase();
  var gestor = cfg_('EMAIL_GESTOR').toLowerCase();
  if (!dest) { Logger.log('Sem destinatário (' + tipo + ') — configure as propriedades do script.'); return false; }
  if (gestor && dest === gestor && tipo !== 'RESUMO') { Logger.log('Bloqueado: ' + tipo + ' não vai ao gestor.'); return false; }
  var op = { to: destino, subject: assunto, body: corpoTxt };
  if (corpoHtml) op.htmlBody = corpoHtml;
  MailApp.sendEmail(op);
  return true;
}

// ---- helpers de data/hora (aceitam Date OU texto) ----
function fmtData_(v) { return v instanceof Date ? Utilities.formatDate(v, tz_(), 'dd/MM/yyyy') : String(v == null ? '' : v).trim(); }
function fmtHora_(v) { return v instanceof Date ? Utilities.formatDate(v, tz_(), 'HH:mm:ss') : String(v == null ? '' : v).trim(); }
function dataDaLinha_(r) {
  if (r[0] instanceof Date) return fmtData_(r[0]);
  var t = fmtData_(r[0]);
  if (t) return t;
  return r[4] instanceof Date ? fmtData_(r[4]) : '';
}
function momentoDaLinha_(r) {
  if (r[4] instanceof Date) return r[4];
  var d = dataDaLinha_(r).split('/'), h = fmtHora_(r[1]).split(':');
  if (d.length !== 3 || h.length < 2) return null;
  return new Date(+d[2], +d[1] - 1, +d[0], +h[0], +h[1], +(h[2] || 0));
}

// ---- Web App ----
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var nome = String(p.nome || '').trim();
    var acao = String(p.acao || '').trim();
    if (p.ping) return json_({ status: 'ok', versao: VERSAO });
    if (ACOES_VALIDAS.indexOf(acao) === -1 || !nome || nome.length > 80) {
      return json_({ status: 'ignorado', mensagem: 'Ação ou nome inválido.' });
    }
    var cache = CacheService.getScriptCache();
    var chave = 'ponto_' + nome.toLowerCase() + '_' + acao;
    if (cache.get(chave)) return json_({ status: 'duplicado', mensagem: 'Registro repetido ignorado.' });
    cache.put(chave, '1', JANELA_DUPLICADO_SEG);
    salvar_(nome, acao);
    return json_({ status: 'ok', mensagem: 'Registrado!' });
  } catch (err) {
    return json_({ status: 'erro', mensagem: String(err.message || err) });
  }
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function neutro_(v) { var s = String(v == null ? '' : v); return /^[=+\-@]/.test(s) ? "'" + s : s; }  // evita fórmula na planilha

function salvar_(nome, acao) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var agora = new Date();
    var hora = Utilities.formatDate(agora, tz_(), 'HH:mm:ss');
    var dataFmt = Utilities.formatDate(agora, tz_(), 'dd/MM/yyyy');
    aba_().appendRow([dataFmt, hora, neutro_(nome), acao, agora]);
    SpreadsheetApp.flush();
    var org = cfg_('NOME_ORGANIZACAO', 'Controle de Ponto');
    enviarEmail_(cfg_('EMAIL_COLABORADOR'),
      'Comprovante: ' + nome + ' - ' + acao + ' (' + hora + ')',
      'Registro salvo.\n\nNome: ' + nome + '\nAção: ' + acao + '\nHora: ' + hora + '\nData: ' + dataFmt +
      '\n\nO gestor recebe o resumo no fim do dia.',
      '<div style="font-family:sans-serif;max-width:480px;padding:24px;background:#f9f9f9;border-radius:12px;">' +
      '<p style="font-size:13px;color:#888;margin:0 0 16px;">COMPROVANTE DE PONTO · ' + esc_(org) + '</p>' +
      '<h2 style="margin:0 0 8px;font-size:22px;">' + esc_(acao) + '</h2>' +
      '<p style="margin:0 0 20px;font-size:15px;">' + esc_(nome) + '</p>' +
      '<table style="width:100%;font-size:14px;border-collapse:collapse;">' +
      '<tr><td style="padding:8px 0;color:#888;border-bottom:1px solid #eee;">Horário</td><td style="padding:8px 0;font-weight:600;text-align:right;border-bottom:1px solid #eee;">' + hora + '</td></tr>' +
      '<tr><td style="padding:8px 0;color:#888;">Data</td><td style="padding:8px 0;font-weight:600;text-align:right;">' + dataFmt + '</td></tr>' +
      '</table></div>',
      'COMPROVANTE');
  } finally { lock.releaseLock(); }
}
function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ---- resumo de um dia (dd/MM/yyyy) ----
function montarResumo_(dataAlvo) {
  var aba = planilha_().getSheetByName(ABA);
  if (!aba) return null;
  var dados = aba.getDataRange().getValues().slice(1);
  var todas = dados.filter(function (r) { return dataDaLinha_(r) === dataAlvo; });
  if (!todas.length) return null;
  var linhas = [];
  todas.forEach(function (r) {
    var m = momentoDaLinha_(r);
    var ult = linhas.length ? linhas[linhas.length - 1] : null;
    if (ult && ult.acao === String(r[3]) && ult.momento && m && Math.abs(m - ult.momento) < JANELA_REPETIDA_MIN * 60000) return;
    linhas.push({ hora: fmtHora_(r[1]), nome: String(r[2]), acao: String(r[3]), momento: m });
  });
  var ent = linhas.filter(function (l) { return l.acao === 'Entrada'; })[0];
  var sai = linhas.filter(function (l) { return l.acao === 'Saída'; }).pop();
  var aO = linhas.filter(function (l) { return l.acao === 'Saída para almoço'; })[0];
  var aI = linhas.filter(function (l) { return l.acao === 'Retorno do almoço'; }).pop();
  var jornada = '';
  if (ent && sai && ent.momento && sai.momento) {
    var ms = sai.momento - ent.momento;
    if (aO && aI && aO.momento && aI.momento) ms -= (aI.momento - aO.momento);
    if (ms > 0) { var h = Math.floor(ms / 3600000), mi = Math.round((ms % 3600000) / 60000); jornada = h + 'h' + (mi < 10 ? '0' + mi : mi); }
  }
  return { data: dataAlvo, linhas: linhas, jornada: jornada };
}
function textoResumo_(res) {
  var t = 'Registros de ' + res.data + ':\n\n';
  res.linhas.forEach(function (l) { t += ' ' + l.hora + ' ' + l.acao + ' (' + l.nome + ')\n'; });
  t += '\nTotal de batidas: ' + res.linhas.length;
  if (res.jornada) t += '\nJornada trabalhada: ' + res.jornada;
  return t;
}
function htmlResumo_(res) {
  var org = cfg_('NOME_ORGANIZACAO', 'Controle de Ponto'), rows = '';
  res.linhas.forEach(function (l, i) {
    rows += '<tr style="background:' + (i % 2 ? '#f4f4f4' : '#fff') + ';"><td style="padding:9px 12px;">' + esc_(l.hora) + '</td><td style="padding:9px 12px;">' + esc_(l.acao) + '</td><td style="padding:9px 12px;color:#777;">' + esc_(l.nome) + '</td></tr>';
  });
  return '<div style="font-family:sans-serif;max-width:600px;padding:24px;background:#f9f9f9;border-radius:12px;">' +
    '<p style="font-size:13px;color:#888;margin:0 0 8px;">RESUMO DIÁRIO · ' + esc_(org) + '</p>' +
    '<h2 style="margin:0 0 4px;">Ponto - ' + res.data + '</h2>' +
    '<p style="margin:0 0 18px;color:#888;font-size:14px;">' + res.linhas.length + ' batida(s)' + (res.jornada ? ' · jornada de ' + res.jornada : '') + '</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;background:#fff;"><thead><tr style="background:#eee;"><th style="padding:10px 12px;text-align:left;">Hora</th><th style="padding:10px 12px;text-align:left;">Ação</th><th style="padding:10px 12px;text-align:left;">Nome</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p style="margin-top:22px;font-size:12px;color:#aaa;">Enviado automaticamente · ' + esc_(org) + '</p></div>';
}

// ---- gatilho diário ----
function resumoDiario() {
  var hoje = Utilities.formatDate(new Date(), tz_(), 'dd/MM/yyyy');
  var res = montarResumo_(hoje);
  var gestor = cfg_('EMAIL_GESTOR');
  if (!res) { enviarEmail_(gestor, 'Resumo de Ponto - ' + hoje + ' (sem registros)', 'Não houve registros em ' + hoje + '.', null, 'RESUMO'); return; }
  enviarEmail_(gestor, 'Resumo de Ponto - ' + hoje + ' · ' + res.linhas.length + ' batidas', textoResumo_(res), htmlResumo_(res), 'RESUMO');
}
function reenviarResumo(dataStr) {   // ex.: reenviarResumo('18/09/2026')
  var res = montarResumo_(dataStr);
  if (!res) { Logger.log('Sem registros em ' + dataStr); return; }
  enviarEmail_(cfg_('EMAIL_GESTOR'), 'Resumo de Ponto - ' + res.data + ' · ' + res.linhas.length + ' batidas', textoResumo_(res), htmlResumo_(res), 'RESUMO');
}
function testarResumo() {            // manda o último dia com registros SÓ para EMAIL_COLABORADOR
  var dados = aba_().getDataRange().getValues().slice(1);
  if (!dados.length) { Logger.log('Planilha vazia.'); return; }
  var res = montarResumo_(dataDaLinha_(dados[dados.length - 1]));
  if (!res) { Logger.log('Nada para resumir.'); return; }
  enviarEmail_(cfg_('EMAIL_COLABORADOR'), '[TESTE] Resumo de Ponto - ' + res.data, textoResumo_(res), htmlResumo_(res), 'TESTE');
}
function resetarGatilhos() {         // remove gatilhos antigos e cria o do resumo às ~18h
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('resumoDiario').timeBased().everyDays(1).atHour(18).create();
}
function diagnostico() {
  Logger.log('Versão: ' + VERSAO + ' | fuso: ' + tz_());
  Logger.log('Planilha: ' + (cfg_('ID_PLANILHA') ? 'por ID (propriedade)' : 'vinculada ao script'));
  Logger.log('Gatilhos: ' + ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }).join(', '));
}
