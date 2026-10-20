// ==========================================
// ↩️ REAÇÕES EM COMBATE
//
// Reação = Ação fora do turno, para reagir a algo (normalmente, um ataque contra você ou contra um aliado).
//
// 1) Reação UNIVERSAL ("Atacar o ataque"): qualquer um pode, quando o ataque ACERTA. Não há rolagem de Acerto:
//    quem reage rola o seu Dano contra o Dano que receberia. Se o Dano da reação passa o recebido, não toma nada;
//    senão toma só a diferença (Dano do atacante − Dano de quem reagiu).
// 2) Reações de TÉCNICA: uma técnica (Poder/Forma/Habilidade ou Técnica Elemental) com Ação gasta = Reação e uma
//    configuração de reação (reacaoGatilho + reacaoEfeito + reacaoValor) aparece como opção quando o gatilho bate:
//      errou  = o ataque contra mim erra        (ex.: Instinto Superior: ataca o oponente, Dano direto)
//      acertou = o ataque contra mim acerta     (ex.: Instinto Bestial: contra-ataque)
//      sempre = acerte ou erre                  (ex.: Assassin: reduz em 50% o Dano de um ataque)
//      aliado = um aliado é atacado             (ajudar: subir a CA dele, atacar o ataque/o atacante)
//    A técnica precisa estar LIGADA (Poder/Forma/Habilidade ativa, Técnica Elemental equipada).
// Efeitos: reduzir_dano (%) e atacar_ataque entram sozinhos no Dano recebido (Defesa > Receber Dano); contra_ataque,
// atacar_atacante e aumentar_ca são registrados no feed e quem reagiu rola/aplica normalmente (a Reação já foi gasta).
// ==========================================

export const GATILHOS_REACAO = [
    { id: '', rotulo: 'Escolha quando pode ser usada' },
    { id: 'errou', rotulo: 'Quando o ataque contra mim ERRA' },
    { id: 'acertou', rotulo: 'Quando o ataque contra mim ACERTA' },
    { id: 'sempre', rotulo: 'Quando sou atacado (acerte ou erre)' },
    { id: 'aliado', rotulo: 'Quando um aliado é atacado' }
];

export const EFEITOS_REACAO = [
    { id: '', rotulo: 'Escolha o efeito', usaValor: false },
    { id: 'contra_ataque', rotulo: 'Contra-atacar o atacante', usaValor: false },
    { id: 'atacar_atacante', rotulo: 'Atacar o atacante (Dano direto)', usaValor: false },
    { id: 'atacar_ataque', rotulo: 'Atacar o ataque (Dano contra Dano)', usaValor: false },
    { id: 'reduzir_dano', rotulo: 'Reduzir o Dano recebido (%)', usaValor: true, unidade: '%' },
    { id: 'aumentar_ca', rotulo: 'Aumentar a CA (+N)', usaValor: true, unidade: 'CA' }
];

const GATILHOS = new Set(GATILHOS_REACAO.map(g => g.id).filter(Boolean));
const EFEITOS = new Map(EFEITOS_REACAO.filter(e => e.id).map(e => [e.id, e]));

export const OPCAO_UNIVERSAL = { id: 'universal', origem: 'universal', nome: 'Atacar o ataque', efeito: 'atacar_ataque', valor: 0, gatilho: 'acertou' };

export function normalizarGatilho(v) { const g = String(v ?? '').trim(); return GATILHOS.has(g) ? g : ''; }
export function normalizarEfeito(v) { const e = String(v ?? '').trim(); return EFEITOS.has(e) ? e : ''; }
export function efeitoUsaValor(efeito) { const e = EFEITOS.get(normalizarEfeito(efeito)); return !!(e && e.usaValor); }
export function getRotuloEfeito(efeito) { const e = EFEITOS.get(normalizarEfeito(efeito)); return e ? e.rotulo : ''; }

// Valor numérico da reação (% para reduzir_dano, +N para aumentar_ca), nunca negativo; reduzir_dano vai de 0 a 100.
export function normalizarValorReacao(efeito, valor) {
    const n = Math.max(0, parseFloat(valor) || 0);
    return normalizarEfeito(efeito) === 'reduzir_dano' ? Math.min(100, n) : n;
}

// A reação configurada na técnica, ou null se ela não é uma técnica de Reação completa.
export function getReacaoDaTecnica(t) {
    if (!t || t.tipoAcao !== 'reacao') return null;
    const gatilho = normalizarGatilho(t.reacaoGatilho);
    const efeito = normalizarEfeito(t.reacaoEfeito);
    if (!gatilho || !efeito) return null;
    return { gatilho, efeito, valor: normalizarValorReacao(efeito, t.reacaoValor) };
}

// A técnica de Reação está "ligada" (pronta para usar)?
function tecnicaLigada(t, origem) { return origem === 'tecnica' ? !!t.equipado : t.ativa === true; }

function gatilhoBate(gatilho, { acertou, alvoEhAliado }) {
    if (gatilho === 'aliado') return !!alvoEhAliado;
    if (alvoEhAliado) return false;
    if (gatilho === 'errou') return !acertou;
    if (gatilho === 'acertou') return !!acertou;
    return gatilho === 'sempre';
}

// Opções de Reação para um ataque: { acertou, alvoEhAliado }. Cada opção: { id, origem, nome, efeito, valor, gatilho }.
// A universal só existe para o próprio alvo e quando o ataque acerta (se errou, não há Dano a reduzir).
export function opcoesDeReacao(ficha, contexto = {}) {
    const opcoes = [];
    if (!contexto.alvoEhAliado && contexto.acertou) opcoes.push({ ...OPCAO_UNIVERSAL });
    const fonte = [
        ...(Array.isArray(ficha?.poderes) ? ficha.poderes.map(t => ({ t, origem: 'poder' })) : []),
        ...(Array.isArray(ficha?.ataquesElementais) ? ficha.ataquesElementais.map(t => ({ t, origem: 'tecnica' })) : [])
    ];
    fonte.forEach(({ t, origem }) => {
        if (!t || !tecnicaLigada(t, origem)) return;
        const r = getReacaoDaTecnica(t);
        if (!r || !gatilhoBate(r.gatilho, contexto)) return;
        opcoes.push({ id: `${origem}:${t.id}`, origem, nome: t.nome || 'Sem nome', efeito: r.efeito, valor: r.valor, gatilho: r.gatilho });
    });
    return opcoes;
}

// Aplica as reações pendentes ao Dano recebido. `reacoes` = [{ efeito, valor, nome, danoReacao? }].
// atacar_ataque desconta o Dano de quem reagiu (primeiro); reduzir_dano tira a % do que sobrou.
// `faltaDanoReacao` = há "atacar o ataque" sem o Dano rolado ainda.
export function aplicarReacoesAoDano(dano, reacoes) {
    let final = Math.max(0, Number(dano) || 0);
    const detalhes = [];
    let faltaDanoReacao = false;
    (reacoes || []).filter(r => r && r.efeito === 'atacar_ataque').forEach(r => {
        const d = Number(r.danoReacao);
        if (!Number.isFinite(d)) { faltaDanoReacao = true; return; }
        const antes = final;
        final = Math.max(0, final - Math.max(0, d));
        detalhes.push(`${r.nome || 'Reação'}: Dano ${Math.floor(d)} contra ${Math.floor(antes)} → ${Math.floor(final)}`);
    });
    (reacoes || []).filter(r => r && r.efeito === 'reduzir_dano').forEach(r => {
        const pct = normalizarValorReacao('reduzir_dano', r.valor);
        final = Math.floor(final * (1 - pct / 100));
        detalhes.push(`${r.nome || 'Reação'}: -${pct}% do Dano`);
    });
    return { final: Math.floor(final), detalhes, faltaDanoReacao };
}

// Reação pendente vale só por alguns minutos (um ataque esquecido não pode engolir Danos futuros).
export const VALIDADE_REACAO_MS = 10 * 60 * 1000;

export function reacaoPendenteValida(r, agora = Date.now()) {
    if (!r) return false;
    const criada = Number(r.criadoEm);
    return !Number.isFinite(criada) || (agora - criada) <= VALIDADE_REACAO_MS;
}

// Reações pendentes ainda válidas (as vencidas são ignoradas).
export function reacoesPendentesValidas(ficha, agora = Date.now()) {
    const lista = ficha?.combate?.reacoesPendentes;
    return Array.isArray(lista) ? lista.filter(r => reacaoPendenteValida(r, agora)) : [];
}

// Tem reação pendente de "atacar o ataque" ainda esperando o Dano ser rolado?
export function reacaoAguardandoDano(ficha, agora = Date.now()) {
    return reacoesPendentesValidas(ficha, agora).find(r => r.efeito === 'atacar_ataque' && !Number.isFinite(Number(r.danoReacao))) || null;
}
