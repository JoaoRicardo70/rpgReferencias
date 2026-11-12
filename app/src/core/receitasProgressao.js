// ==========================================
// 📈 RECEITAS DE PROGRESSÃO EM COMBATE — lógica pura. Um construtor GENÉRICO: qualquer poder (Habilidade, Forma, Poder, e as futuras
// categorias) ganha "aprimoramento constante durante o combate" montando gatilhos + contadores a partir de uma receita com poucos campos.
// Nada aqui toca em React, Firebase nem na ficha: construir() só DEVOLVE dados; quem chama (PoderesFormContext) os acrescenta ao RASCUNHO do poder.
//
// Catálogo: RECEITAS = [{ id, nome, resumo, campos: [{ id, rotulo, tipo: 'numero'|'select'|'evento', padrao, min, max, passo?, opcoes? }],
//                         construir(params, ctx) => { gatilhos, contadores, avisos } }]
//   params: valores crus dos campos (texto ou número); sempre normalizados por paramsReceita (preso a min/max, select cai no padrão).
//   ctx (opcional): { idsGatilhos: [ids já usados no poder], idsContadores: [ids de contador já usados na ficha] } só para escolher ids livres.
//
// IDs: gatilhos `rp_<receita>_<k>_g<i>`, contadores `rp_<receita>_<k>_c`; <k> é a menor "instância" (1, 2, 3…) sem colisão com ctx
// (aplicar a mesma receita duas vezes no mesmo poder não colide). Os contadores ficam com id estável (o gatilho aponta para ele).
// Tudo sai por normalizarGatilhos / normalizarContadorRascunho; o que eles descartarem NÃO some em silêncio: vira texto em `avisos`.
//
// SUPOSIÇÕES (detalhe em D:\sistema rpg anime\ficha-referencia\modelos-prontos.md > "Receitas de Progressão"):
//  - Cada receita tem o campo 'Duração' (permanente | combate; padrão 'combate' em ganhoPorEvento/crescerPorTurno, 'permanente' em acumularEConverter/bonusACadaN): 'combate' emite duracao:'combate' (ficha.ganhosCombate, zera no fim da luta).
//  - Ganho é sempre PERCENTUAL (`ganhoPermanente` unidade 'percentual'), modo 'somar' (linear) ou 'multiplicar' (composto).
//  - Gatilhos nascem `automatico` + `armado: true`; com `opcionais` = 'sim' nascem `opcional` + desarmados (o dono arma depois).
//  - "No máximo N vezes" e o teto de turnos usam o `limite` do gatilho (por turno | cena | descanso), não um contador-guardião.
//  - Contador que alimenta um ganho em `fimDeLuta` é PERMANENTE: resetarContadoresDeCena roda ANTES dos gatilhos de fimDeLuta
//    (core/gatilhosAplicar.js) e o zeraria antes da leitura; o próprio ganho zera o contador (zerar: true).
// ==========================================
import { normalizarGatilhos, LIMITE_GATILHOS_POR_FONTE } from './gatilhos.js';
import { normalizarContadorRascunho, LIMITE_CONTADORES, LIMITE_VALOR_CONTADOR } from './contadores.js';

export const LIMITE_PERCENTUAL_RECEITA = 1000;

const numero = (v, padrao) => { if (v === '' || v === null || v === undefined) return padrao; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : padrao; };
const preso = (n, min, max) => Math.max(min, Math.min(max, n));

// ---------- Opções compartilhadas ----------
// Evento escolhido como 'tipo:nivel' (nivel só em acertou/atingido).
export const EVENTOS_RECEITA = [
    { id: 'acertou:qualquer', rotulo: 'Acertar um golpe (qualquer)', so: 'acerto' },
    { id: 'acertou:normal', rotulo: 'Acertar um golpe normal' },
    { id: 'acertou:critico', rotulo: 'Acertar um golpe crítico' },
    { id: 'acertou:fatal', rotulo: 'Acertar um golpe fatal' },
    { id: 'atingido:qualquer', rotulo: 'Sofrer dano na Vida (qualquer golpe)' },
    { id: 'atingido:critico', rotulo: 'Sofrer um golpe crítico' },
    { id: 'atingido:fatal', rotulo: 'Sofrer um golpe fatal' },
    { id: 'errou', rotulo: 'Errar um golpe' },
    { id: 'turnoInicio', rotulo: 'Início do meu turno' },
    { id: 'turnoFim', rotulo: 'Fim do meu turno' },
];
const IDS_EVENTOS = EVENTOS_RECEITA.map(e => e.id);
const IDS_EVENTOS_SEM_TURNO = IDS_EVENTOS.filter(id => id !== 'turnoInicio' && id !== 'turnoFim');
const opcoesEventos = (ids) => EVENTOS_RECEITA.filter(e => ids.includes(e.id)).map(({ id, rotulo }) => ({ id, rotulo }));

export const MODOS_RECEITA = [
    { id: 'multiplicar', rotulo: 'Multiplicar o Poder (composto)' },
    { id: 'somar', rotulo: 'Somar ao bônus (linear)' },
];
const PERIODOS_RECEITA = [{ id: 'turno', rotulo: 'por turno' }, { id: 'cena', rotulo: 'por cena' }, { id: 'descanso', rotulo: 'por descanso' }];
export const DURACOES_RECEITA = [{ id: 'permanente', rotulo: 'Permanente' }, { id: 'combate', rotulo: 'Só durante o combate (zera no fim da luta)' }];
const SIM_NAO = [{ id: 'nao', rotulo: 'Não' }, { id: 'sim', rotulo: 'Sim' }];

const campoModo = (padrao = 'multiplicar') => ({ id: 'modo', rotulo: 'Como o ganho age', tipo: 'select', padrao, opcoes: MODOS_RECEITA });
const campoPercentual = (rotulo, padrao, min = 0.01) => ({ id: 'percentual', rotulo, tipo: 'numero', padrao, min, max: LIMITE_PERCENTUAL_RECEITA, passo: 0.01 });
const campoDuracao = (padrao) => ({ id: 'duracao', rotulo: 'Duração do ganho', tipo: 'select', padrao, opcoes: DURACOES_RECEITA });
const campoOpcionais = () => ({ id: 'opcionais', rotulo: 'Criar opcionais e desarmados (o dono arma depois)', tipo: 'select', padrao: 'nao', opcoes: SIM_NAO });
const campoEvento = (ids, padrao, rotulo = 'Quando') => ({ id: 'evento', rotulo, tipo: 'evento', padrao, opcoes: opcoesEventos(ids) });

// ---------- Auxiliares ----------
export function eventoDaReceita(id) {
    const [tipo, nivel] = String(id || '').split(':');
    if (!IDS_EVENTOS.includes(id)) return null;
    return nivel ? { tipo, nivel } : { tipo };
}
const rotuloEvento = (id) => (EVENTOS_RECEITA.find(e => e.id === id) || { rotulo: id }).rotulo.toLowerCase();
const fmt = (n) => String(Math.round(n * 1e4) / 1e4).replace('.', ',');
const textoModo = (modo) => (modo === 'multiplicar' ? 'multiplica' : 'soma');

// Params crus -> params limpos conforme os campos da receita.
export function paramsReceita(receita, brutos = {}) {
    const saida = {};
    (receita.campos || []).forEach((c) => {
        const v = brutos ? brutos[c.id] : undefined;
        if (c.tipo === 'numero') {
            const n = numero(v, c.padrao);
            saida[c.id] = preso(c.passo && c.passo < 1 ? n : Math.trunc(n), c.min, c.max);
        } else saida[c.id] = (c.opcoes || []).some(o => o.id === v) ? v : c.padrao;
    });
    return saida;
}
export const paramsPadraoReceita = (receita) => paramsReceita(receita, {});

// Ids livres para uma instância da receita: menor k sem colisão (ids de gatilho no poder, ids de contador na ficha).
function instancia(receitaId, nGatilhos, temContador, ctx) {
    const gat = new Set(((ctx && ctx.idsGatilhos) || []).map(String));
    const con = new Set(((ctx && ctx.idsContadores) || []).map(String));
    for (let k = 1; k < 1000; k++) {
        const idsG = Array.from({ length: nGatilhos }, (_, i) => `rp_${receitaId}_${k}_g${i + 1}`);
        const idC = `rp_${receitaId}_${k}_c`;
        if (idsG.every(id => !gat.has(id)) && (!temContador || !con.has(idC))) return { gatilhos: idsG, contador: idC };
    }
    return { gatilhos: Array.from({ length: nGatilhos }, (_, i) => `rp_${receitaId}_x_g${i + 1}`), contador: `rp_${receitaId}_x_c` };
}

// Acabamento comum: modo/armado, validação por normalizarGatilhos/normalizarContadorRascunho e avisos do que for descartado.
function finalizar(brutos, contadoresBrutos, p) {
    const opcional = p.opcionais === 'sim';
    const comModo = brutos.map(g => ({ ...g, modo: opcional ? 'opcional' : 'automatico', armado: !opcional, prioridade: 0 }));
    const norm = normalizarGatilhos(comModo, { persistir: false });
    const avisos = norm.descartados.map(d => `Gatilho "${d.nome}" descartado: ${d.motivo}.`);
    // persistir:false pode trocar ids repetidos; as receitas geram ids únicos, então o id sempre se mantém.
    const contadores = [];
    contadoresBrutos.forEach((c) => {
        const n = normalizarContadorRascunho(c);
        if (!n) { avisos.push(`Contador "${c && c.nome}" descartado: dados inválidos.`); return; }
        if (String(n.id) !== String(c.id)) { avisos.push(`Contador "${n.nome}" teve o id trocado.`); }
        contadores.push(n);
    });
    return { gatilhos: norm.gatilhos, contadores, avisos };
}

const limiteDeUsos = (p) => (numero(p.limiteUsos, 0) > 0 ? { max: Math.floor(p.limiteUsos), por: p.limitePor } : null);
const ganho = (p, extra = {}) => ({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: p.modo, ...(p.duracao === 'combate' ? { duracao: 'combate' } : {}), valor: p.percentual, ...extra });
const textoLimite = (lim) => (lim ? `, máx ${lim.max}x/${lim.por}` : '');

// ---------- a) Ganho por evento ----------
const GANHO_EVENTO = {
    id: 'ganhoPorEvento',
    nome: 'Ganho por evento',
    resumo: 'A cada evento (acertar, ser atingido, errar, início/fim do turno) o Poder ganha X%. Duração padrão: só durante o combate (zera no fim da luta); mude para Permanente se o ganho deve ficar.',
    campos: [
        campoEvento(IDS_EVENTOS, 'acertou:qualquer', 'A cada'),
        campoPercentual('Ganho de Poder (%)', 2),
        campoModo(),
        campoDuracao('combate'),
        { id: 'limiteUsos', rotulo: 'No máximo N vezes (0 = sem limite)', tipo: 'numero', padrao: 0, min: 0, max: 99 },
        { id: 'limitePor', rotulo: 'Limite vale', tipo: 'select', padrao: 'cena', opcoes: PERIODOS_RECEITA },
        campoOpcionais(),
    ],
    construir(brutos, ctx) {
        const p = paramsReceita(this, brutos);
        const ids = instancia(this.id, 1, false, ctx);
        const limite = limiteDeUsos(p);
        return finalizar([{
            id: ids.gatilhos[0],
            nome: `+${fmt(p.percentual)}% ao ${rotuloEvento(p.evento)} (${textoModo(p.modo)}${textoLimite(limite)})`,
            evento: eventoDaReceita(p.evento), acoes: [ganho(p)], ...(limite ? { limite } : {}),
        }], [], p);
    },
};

// ---------- b) Acumular e converter no fim da luta ----------
const ACUMULAR = {
    id: 'acumularEConverter',
    nome: 'Acumular e converter no fim da luta',
    resumo: 'Cada evento acumula pontos num contador; no fim da luta os pontos viram ganho permanente de Poder (pontos x fator %) e o contador zera.',
    campos: [
        campoEvento(IDS_EVENTOS, 'acertou:qualquer', 'Acumula a cada'),
        { id: 'pontos', rotulo: 'Pontos por evento', tipo: 'numero', padrao: 1, min: 1, max: 100 },
        { id: 'teto', rotulo: 'Máximo de pontos acumulados', tipo: 'numero', padrao: 999, min: 1, max: LIMITE_VALOR_CONTADOR },
        { id: 'percentual', rotulo: 'Cada ponto vale (% de Poder)', tipo: 'numero', padrao: 0.1, min: 0.01, max: LIMITE_PERCENTUAL_RECEITA, passo: 0.01 },
        campoModo(),
        campoDuracao('permanente'),
        campoOpcionais(),
    ],
    construir(brutos, ctx) {
        const p = paramsReceita(this, brutos);
        const ids = instancia(this.id, 2, true, ctx);
        const idC = ids.contador;
        return finalizar([
            { id: ids.gatilhos[0], nome: `Progressão: acumula ${p.pontos} ao ${rotuloEvento(p.evento)}`, evento: eventoDaReceita(p.evento), acoes: [{ tipo: 'contador', id: idC, op: 'somar', valor: p.pontos }] },
            {
                id: ids.gatilhos[1], nome: `Progressão: no fim da luta, pontos x ${fmt(p.percentual)}% de Poder (${textoModo(p.modo)})`, evento: { tipo: 'fimDeLuta' },
                acoes: [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo: p.modo, ...(p.duracao === 'combate' ? { duracao: 'combate' } : {}), deContador: { id: idC, fator: p.percentual, zerar: true } }],
            },
        ], [{ id: idC, nome: 'Progressão: pontos acumulados', min: 0, max: p.teto }], p);
    },
};

// ---------- c) Crescer por turno (Adaptação) ----------
const POR_TURNO = {
    id: 'crescerPorTurno',
    nome: 'Crescer por turno (Adaptação)',
    resumo: 'A cada início do seu turno em combate o Poder ganha X% (composto ou linear), com teto opcional de turnos por combate (volta a cada fim de luta, troca de cena ou descanso). Duração padrão: só durante o combate (zera no fim da luta).',
    campos: [
        campoPercentual('Ganho por turno (%)', 1),
        campoModo(),
        campoDuracao('combate'),
        { id: 'tetoTurnos', rotulo: 'Teto de turnos por combate (0 = sem teto; volta a cada fim de luta, troca de cena ou descanso)', tipo: 'numero', padrao: 0, min: 0, max: 99 },
        campoOpcionais(),
    ],
    construir(brutos, ctx) {
        const p = paramsReceita(this, brutos);
        const teto = p.tetoTurnos > 0;
        const ids = instancia(this.id, 1, teto, ctx);
        const acoes = [ganho(p)];
        const contadores = [];
        // O teto vale pelo `limite` por cena do gatilho; o contador "turnos" só mostra a contagem. Os dois recomeçam no fimDeLuta (cada Cena conta como um combate).
        if (teto) { acoes.push({ tipo: 'contador', id: ids.contador, op: 'somar', valor: 1 }); contadores.push({ id: ids.contador, nome: 'Progressão: turnos em combate', min: 0, max: p.tetoTurnos, reset: 'cena' }); }
        return finalizar([{
            id: ids.gatilhos[0],
            nome: `+${fmt(p.percentual)}% por turno (${p.modo === 'multiplicar' ? 'composto' : 'linear'}${teto ? `, até ${p.tetoTurnos} turnos/combate` : ''})`,
            evento: { tipo: 'turnoInicio' }, acoes, ...(teto ? { limite: { max: p.tetoTurnos, por: 'cena' } } : {}),
        }], contadores, p);
    },
};

// ---------- d) Bônus a cada N eventos ----------
const A_CADA_N = {
    id: 'bonusACadaN',
    nome: 'Bônus a cada N eventos',
    resumo: 'Conta os eventos; ao chegar em N o Poder ganha X% e a contagem recomeça.',
    campos: [
        campoEvento(IDS_EVENTOS, 'acertou:qualquer', 'Conta cada'),
        { id: 'n', rotulo: 'A cada N eventos', tipo: 'numero', padrao: 3, min: 2, max: 999 },
        campoPercentual('Ganho de Poder (%)', 2),
        campoModo(),
        campoDuracao('permanente'),
        { id: 'reinicio', rotulo: 'A contagem zera ao fim da cena', tipo: 'select', padrao: 'nao', opcoes: SIM_NAO },
        campoOpcionais(),
    ],
    construir(brutos, ctx) {
        const p = paramsReceita(this, brutos);
        const ids = instancia(this.id, 2, true, ctx);
        const idC = ids.contador;
        return finalizar([
            { id: ids.gatilhos[0], nome: `Progressão: conta ${rotuloEvento(p.evento)}`, evento: eventoDaReceita(p.evento), acoes: [{ tipo: 'contador', id: idC, op: 'somar', valor: 1 }] },
            {
                id: ids.gatilhos[1], nome: `Progressão: +${fmt(p.percentual)}% a cada ${p.n} eventos (${textoModo(p.modo)})`,
                evento: { tipo: 'contadorAtingiu', contadorId: idC, op: '>=', valor: p.n },
                acoes: [ganho(p), { tipo: 'contador', id: idC, op: 'zerar' }],
            },
        ], [{ id: idC, nome: 'Progressão: contagem de eventos', min: 0, max: p.n, ...(p.reinicio === 'sim' ? { reset: 'cena' } : {}) }], p);
    },
};

export const RECEITAS = [GANHO_EVENTO, ACUMULAR, POR_TURNO, A_CADA_N];
export const obterReceita = (id) => RECEITAS.find(r => r.id === id) || null;

// Confere se o resultado de construir() cabe no poder/ficha. `existentes`: { gatilhos: n no rascunho, contadores: n total da ficha já contando o rascunho }.
// Devolve { ok, erro, avisos }.
export function conferirLimitesProgressao(resultado, existentes = {}) {
    const avisos = [...(resultado.avisos || [])];
    const g = (existentes.gatilhos || 0) + resultado.gatilhos.length;
    const c = (existentes.contadores || 0) + resultado.contadores.length;
    let erro = '';
    if (resultado.gatilhos.length === 0) erro = 'A receita não gerou nenhum gatilho válido.';
    else if (g > LIMITE_GATILHOS_POR_FONTE) erro = `Cada poder comporta ${LIMITE_GATILHOS_POR_FONTE} gatilhos (ficaria com ${g}). Remova algum gatilho antes.`;
    else if (c > LIMITE_CONTADORES) erro = `A ficha só comporta ${LIMITE_CONTADORES} contadores (ficaria com ${c}). Remova algum contador antes.`;
    return { ok: !erro, erro, avisos };
}

// Frase única do que a receita fará, para o resumo da UI.
export const resumirResultado = (resultado) => ({
    gatilhos: resultado.gatilhos.length,
    contadores: resultado.contadores.length,
    nomes: resultado.gatilhos.map(g => g.nome),
});
