// ==========================================
// ESTÁGIOS DE PODERES / FORMAS / HABILIDADES — lógica pura (pedido do usuário).
//
// Algumas técnicas têm "estágios": os Portões Internos vão do 1º ao 10º, o Kaioken não tem teto
// (só o quanto o usuário aguenta). Em vez de criar uma técnica por estágio, a técnica guarda:
//   poder.estagios = { habilitado, maximo (0 = sem limite), crescimento (% por estágio),
//                      fadigaPorEstagio (pontos de Fadiga por turno, por estágio), rotulo, nomes[] }
//   poder.estagioAtual = 1, 2, 3...
//
// Os efeitos ATIVOS cadastrados na técnica valem pro 1º estágio; cada estágio acima soma
// `crescimento`% do valor original (100% = 2º estágio dobra, 3º triplica...). A conversão
// acontece num ponto só — core/efeitos-resolver.js > resolverEfeitosEntidade — então Status,
// Scouter, Ataque, Mapa e Fadiga enxergam o estágio sem mudar nada neles. Efeitos PASSIVOS não
// escalam (valem sempre, ligada ou não).
//
// Fadiga: enquanto a técnica está ativa, o início de cada turno no Mapa soma
// fadigaPorEstagio × estágio (core/fadiga.js > calcularGanhoFadigaDinamico) — cada estágio acima
// cansa mais que o anterior.
//
// 🔀 MUDANÇAS EM ESTÁGIOS ESPECÍFICOS (estagios.marcos): nem toda técnica cresce em linha reta.
// Ex.: Portões Internos dão MGeral 10x no 1º até 60x no 6º, mas no 7º saltam pra 120x E ganham um
// MÚnico 1.5x. Um marco { estagio: 7, efeitos: [...], crescimento?, fadigaPorEstagio? } diz: "a
// partir do 7º, os efeitos ativos passam a ser ESTES" (substituem os anteriores). Dali em diante
// eles crescem com o crescimento do marco (ou o geral, se o marco não definir), contando a partir
// do próprio marco — o 8º seria o marco × (1 + crescimento). A Fadiga por estágio também pode
// mudar no marco. Sem marcos, tudo funciona como antes.
// ==========================================

// Teto de segurança pra técnicas "sem limite": evita valores infinitos (que quebram o JSON do
// Firebase e a matemática dos atributos) se alguém digitar um estágio absurdo.
export const ESTAGIO_MAXIMO_ABSOLUTO = 1000000;
const CRESCIMENTO_MAXIMO = 1000000;

export const ESTAGIOS_PADRAO = Object.freeze({
    habilitado: false,
    maximo: 10,
    crescimento: 100,
    fadigaPorEstagio: 2,
    rotulo: 'Estágio',
    nomes: [],
    marcos: [],
});

function numeroOu(v, padrao, min = 0, max = Infinity) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return padrao;
    return Math.min(max, Math.max(min, n));
}

// Último estágio digitado: vazio/inválido/negativo = padrão (10); 0 = sem limite.
function maximoValido(v) {
    const n = Math.floor(parseFloat(v));
    if (!Number.isFinite(n) || n < 0) return ESTAGIOS_PADRAO.maximo;
    return Math.min(n, ESTAGIO_MAXIMO_ABSOLUTO);
}

// Número opcional de um marco: vazio = "igual ao geral" (null).
function numeroOpcional(v, max = Infinity) {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(0, n));
}

function normalizarEfeito(e) {
    if (!e || typeof e !== 'object') return null;
    return {
        nome: String(e.nome ?? '').trim(),
        atributo: String(e.atributo ?? ''),
        propriedade: String(e.propriedade ?? ''),
        valor: e.valor ?? '',
        ...(e.fixo ? { fixo: true } : {}),
    };
}

// O Firebase devolve arrays como objetos {0:..,1:..} às vezes, e apaga arrays vazios.
function comoLista(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.values(v);
    return [];
}

// Marcos válidos: estágio inteiro >= 2 (o 1º são os efeitos da própria técnica), um por estágio
// (o último digitado vence), em ordem crescente.
export function normalizarMarcos(lista) {
    const porEstagio = new Map();
    comoLista(lista).forEach(m => {
        if (!m || typeof m !== 'object') return;
        const est = Math.floor(parseFloat(m.estagio));
        if (!Number.isFinite(est) || est < 2 || est > ESTAGIO_MAXIMO_ABSOLUTO) return;
        porEstagio.set(est, {
            estagio: est,
            // Linha de efeito sem valor (recém-adicionada no editor e não preenchida) não é gravada.
            efeitos: comoLista(m.efeitos).map(normalizarEfeito).filter(e => e && String(e.valor).trim() !== ''),
            crescimento: numeroOpcional(m.crescimento, CRESCIMENTO_MAXIMO),
            fadigaPorEstagio: numeroOpcional(m.fadigaPorEstagio),
        });
    });
    return [...porEstagio.values()].sort((a, b) => a.estagio - b.estagio);
}

// Config de estágios sempre bem formada (dados antigos, da Sexta-Feira ou digitados à mão).
export function normalizarEstagios(cfg) {
    const c = (cfg && typeof cfg === 'object') ? cfg : {};
    const nomesBrutos = Array.isArray(c.nomes)
        ? c.nomes
        : (typeof c.nomes === 'string' ? c.nomes.split('\n') : []);
    return {
        habilitado: !!c.habilitado,
        maximo: maximoValido(c.maximo),
        crescimento: numeroOu(c.crescimento, ESTAGIOS_PADRAO.crescimento, 0, CRESCIMENTO_MAXIMO),
        fadigaPorEstagio: numeroOu(c.fadigaPorEstagio, ESTAGIOS_PADRAO.fadigaPorEstagio),
        rotulo: String(c.rotulo ?? '').trim() || ESTAGIOS_PADRAO.rotulo,
        nomes: nomesBrutos.map(n => String(n ?? '').trim()),
        marcos: normalizarMarcos(c.marcos),
    };
}

// resolverEfeitosEntidade roda muitas vezes por render: guarda a config normalizada por objeto
// (o Immer cria um objeto novo a cada alteração, então a cache nunca fica velha).
const cacheNormalizado = new WeakMap();
function cfgDe(poder) {
    const bruto = poder?.estagios;
    if (!bruto || typeof bruto !== 'object') return normalizarEstagios(bruto);
    let cfg = cacheNormalizado.get(bruto);
    if (!cfg) { cfg = normalizarEstagios(bruto); cacheNormalizado.set(bruto, cfg); }
    return cfg;
}

export function temEstagios(poder) {
    return !!(poder && poder.estagios && poder.estagios.habilitado);
}

// Último estágio possível (Infinity quando a técnica não tem teto, ex.: Kaioken).
export function getMaximoEstagio(poder) {
    const max = cfgDe(poder).maximo;
    return max >= 1 ? max : Infinity;
}

export function limitarEstagio(poder, n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v) || v < 1) return 1;
    return Math.min(v, getMaximoEstagio(poder), ESTAGIO_MAXIMO_ABSOLUTO);
}

export function getEstagioAtual(poder) {
    if (!temEstagios(poder)) return 1;
    return limitarEstagio(poder, poder.estagioAtual ?? 1);
}

// Regra em vigor no estágio n: o último marco até n (ou o 1º estágio, com os efeitos da técnica).
//   { estagio: onde a regra começa, efeitos: lista do marco (null = efeitos da técnica),
//     crescimento, fadigaPorEstagio }
export function marcoVigente(poder, n = getEstagioAtual(poder)) {
    const cfg = cfgDe(poder);
    const est = limitarEstagio(poder, n);
    let marco = null;
    for (const m of cfg.marcos) { if (m.estagio <= est) marco = m; else break; }
    return {
        estagio: marco ? marco.estagio : 1,
        efeitos: marco ? marco.efeitos : null,
        crescimento: marco && marco.crescimento !== null ? marco.crescimento : cfg.crescimento,
        fadigaPorEstagio: marco && marco.fadigaPorEstagio !== null ? marco.fadigaPorEstagio : cfg.fadigaPorEstagio,
    };
}

// Quanto os efeitos da regra em vigor valem no estágio n (no estágio onde a regra começa = 1x).
export function fatorDoEstagio(poder, n = getEstagioAtual(poder)) {
    if (!temEstagios(poder)) return 1;
    const v = marcoVigente(poder, n);
    return 1 + (limitarEstagio(poder, n) - v.estagio) * (v.crescimento / 100);
}

// Fator "geral" do estágio n, ignorando marcos: 1 + (n - 1) × crescimento geral. Usado nas
// sub-formas da técnica, que não têm lista própria por marco — assim elas nunca "voltam a x1"
// quando a técnica entra num marco.
export function fatorGeralDoEstagio(poder, n = getEstagioAtual(poder)) {
    if (!temEstagios(poder)) return 1;
    return 1 + (limitarEstagio(poder, n) - 1) * (cfgDe(poder).crescimento / 100);
}

// Rascunho de um marco pro editor (EstagiosMarcosEditor.jsx): números como texto, chave estável.
let proximaChaveMarco = 1;
export function marcoParaRascunho(m) {
    const texto = (v) => (v === null || v === undefined ? '' : String(v));
    return {
        chave: `marco-${Date.now()}-${proximaChaveMarco++}`,
        estagio: texto(m?.estagio),
        efeitos: comoLista(m?.efeitos).map(e => ({ ...e })),
        crescimento: texto(m?.crescimento),
        fadigaPorEstagio: texto(m?.fadigaPorEstagio),
    };
}

// Multiplica o valor numérico de cada efeito. Valores não numéricos e efeitos marcados como
// `fixo` (ex.: um MÚnico 1.5x que não cresce com o estágio) ficam como estão.
export function escalarPorFator(efeitos, fator) {
    const lista = efeitos || [];
    if (fator === 1) return lista;
    return lista.map(e => {
        if (!e || e.fixo) return e;
        const v = parseFloat(e.valor);
        if (!Number.isFinite(v)) return e;
        return { ...e, valor: Math.round(v * fator * 10000) / 10000 };
    });
}

// Efeitos ativos de verdade no estágio n: os da técnica (ou do marco em vigor) já com o crescimento.
export function efeitosDoEstagio(efeitosBase, poder, n = getEstagioAtual(poder)) {
    if (!temEstagios(poder)) return efeitosBase || [];
    const v = marcoVigente(poder, n);
    return escalarPorFator(v.efeitos || efeitosBase || [], fatorDoEstagio(poder, n));
}

// Atalho usado por quem lê p.efeitos direto (Ataque, Mapa, card do Grimório): estágio atual.
export function escalarEfeitosPorEstagio(efeitos, poder) {
    return efeitosDoEstagio(efeitos, poder);
}

// "3º Portão" e, se houver nome cadastrado pra ele, "3º Portão — Portão da Vida".
export function nomeDoEstagio(poder, n = getEstagioAtual(poder)) {
    const cfg = cfgDe(poder);
    const est = limitarEstagio(poder, n);
    const curto = `${est}º ${cfg.rotulo}`;
    const proprio = cfg.nomes[est - 1] || '';
    return { curto, proprio, completo: proprio ? `${curto} — ${proprio}` : curto };
}

// Fadiga (pontos %) que a técnica gera a cada início de turno enquanto ativa no estágio n.
// Diferente dos efeitos, conta o estágio ABSOLUTO (não a partir do marco): um marco só troca o
// "por estágio" — o 8º Portão com 5 por estágio gera 40, não 5.
export function fadigaPorTurnoDoEstagio(poder, n = getEstagioAtual(poder)) {
    if (!temEstagios(poder)) return 0;
    return marcoVigente(poder, n).fadigaPorEstagio * limitarEstagio(poder, n);
}

// 🔎 Prévia de cada estágio pro editor ("1º: MGERAL 10 · ... · 7º: MGERAL 120, MUNICO 1.5"), com
// a config ainda em rascunho. Mostra até `limite` estágios (técnicas sem teto também).
export function previaEstagios(efeitosBase, cfgRascunho, limite = 12) {
    const poder = { estagios: { ...normalizarEstagios(cfgRascunho), habilitado: true } };
    const ultimo = Math.min(getMaximoEstagio(poder), limite);
    const linhas = [];
    for (let n = 1; n <= ultimo; n++) {
        linhas.push({
            estagio: n,
            nome: nomeDoEstagio(poder, n).completo,
            marco: n > 1 && marcoVigente(poder, n).estagio === n,
            efeitos: efeitosDoEstagio(efeitosBase, poder, n),
            fadiga: fadigaPorTurnoDoEstagio(poder, n),
        });
    }
    return linhas;
}

// Soma da Fadiga de estágio de todas as técnicas ATIVAS da ficha.
export function getFadigaEstagiosAtivos(ficha) {
    return (ficha?.poderes || []).reduce((soma, p) => (
        p && p.ativa ? soma + fadigaPorTurnoDoEstagio(p) : soma
    ), 0);
}
