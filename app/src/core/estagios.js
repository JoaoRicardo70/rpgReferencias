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
    };
}

export function temEstagios(poder) {
    return !!(poder && poder.estagios && poder.estagios.habilitado);
}

// Último estágio possível (Infinity quando a técnica não tem teto, ex.: Kaioken).
export function getMaximoEstagio(poder) {
    const max = normalizarEstagios(poder?.estagios).maximo;
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

// Quanto os efeitos ativos valem no estágio n (1º estágio = 1x).
export function fatorDoEstagio(poder, n = getEstagioAtual(poder)) {
    if (!temEstagios(poder)) return 1;
    const { crescimento } = normalizarEstagios(poder.estagios);
    return 1 + (limitarEstagio(poder, n) - 1) * (crescimento / 100);
}

// Efeitos com o valor já multiplicado pelo estágio atual. Valores não numéricos ficam como estão.
export function escalarEfeitosPorEstagio(efeitos, poder) {
    const lista = efeitos || [];
    const fator = fatorDoEstagio(poder);
    if (fator === 1) return lista;
    return lista.map(e => {
        if (!e) return e;
        const v = parseFloat(e.valor);
        if (!Number.isFinite(v)) return e;
        return { ...e, valor: Math.round(v * fator * 10000) / 10000 };
    });
}

// "3º Portão" e, se houver nome cadastrado pra ele, "3º Portão — Portão da Vida".
export function nomeDoEstagio(poder, n = getEstagioAtual(poder)) {
    const cfg = normalizarEstagios(poder?.estagios);
    const est = limitarEstagio(poder, n);
    const curto = `${est}º ${cfg.rotulo}`;
    const proprio = cfg.nomes[est - 1] || '';
    return { curto, proprio, completo: proprio ? `${curto} — ${proprio}` : curto };
}

// Fadiga (pontos %) que a técnica gera a cada início de turno enquanto ativa no estágio n.
export function fadigaPorTurnoDoEstagio(poder, n = getEstagioAtual(poder)) {
    if (!temEstagios(poder)) return 0;
    const { fadigaPorEstagio } = normalizarEstagios(poder.estagios);
    return fadigaPorEstagio * limitarEstagio(poder, n);
}

// Soma da Fadiga de estágio de todas as técnicas ATIVAS da ficha.
export function getFadigaEstagiosAtivos(ficha) {
    return (ficha?.poderes || []).reduce((soma, p) => (
        p && p.ativa ? soma + fadigaPorTurnoDoEstagio(p) : soma
    ), 0);
}
