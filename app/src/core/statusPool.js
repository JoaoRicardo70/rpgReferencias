// ==========================================
// POOL DE STATUS — lógica pura (sem React) do Prestígio de Status convertido em pontos que o
// jogador distribui entre os 8 atributos (Ficha Def/Marcados.jsx > "Status (Rank Base)").
//
// Unidades (as mesmas de alocarPontoStatus/devolverPontoStatus em Marcados.jsx):
//   - PONTOS de pool: ficha.statusPool (livres) e ficha.statusPoolGasto (já distribuídos).
//   - BASE bruta: ficha[attr].base e ficha.statusPoolAlocado[attr] (quanto daquela base veio do
//     pool). 1 ponto = 1000 / divisores.status de base.
//
// 🔧 Pedido do usuário: antes, REDUZIR o Prestígio de Status só conseguia tirar pontos ainda
// LIVRES no pool — se eles já estivessem distribuídos, a redução ficava pela metade e o jogador
// tinha que tirar "− Pool" atributo por atributo antes de conseguir corrigir o Prestígio. Agora
// os pontos que faltam são recolhidos automaticamente dos atributos, proporcionalmente ao que
// cada um recebeu do pool.
// ==========================================

export const STATUS_ATRIBUTOS = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const getDivStatus = (ficha) => { const d = parseFloat(ficha?.divisores?.status); return d > 0 ? d : 1; };
const pontosParaBase = (pontos, div) => Math.floor((pontos / div) * 1000);
const baseParaPontos = (base, div) => Math.floor((base / 1000) * div);

// Quantos PONTOS de pool cada atributo pode devolver (limitado pela base que ele ainda tem).
export function getPontosAlocadosPorAtributo(ficha) {
    const div = getDivStatus(ficha);
    const resultado = {};
    STATUS_ATRIBUTOS.forEach((attr) => {
        const alocado = Math.max(0, num(ficha?.statusPoolAlocado?.[attr]));
        const base = Math.max(0, num(ficha?.[attr]?.base));
        resultado[attr] = baseParaPontos(Math.min(alocado, base), div);
    });
    return resultado;
}

export function getTotalPontosAlocados(ficha) {
    const porAttr = getPontosAlocadosPorAtributo(ficha);
    return STATUS_ATRIBUTOS.reduce((soma, attr) => soma + porAttr[attr], 0);
}

// Tira até `pontosPedidos` pontos dos atributos (proporcional ao que cada um recebeu do pool) e
// devolve pro pool livre. Muta o rascunho Immer. Retorna quantos pontos voltaram de fato.
// `pontosPedidos = Infinity` devolve TUDO (botão "Devolver tudo ao Pool").
export function recolherPontosAlocados(ficha, pontosPedidos) {
    if (!ficha) return 0;
    const div = getDivStatus(ficha);
    const porAttr = getPontosAlocadosPorAtributo(ficha);
    const total = STATUS_ATRIBUTOS.reduce((soma, attr) => soma + porAttr[attr], 0);
    const pedido = Number(pontosPedidos);
    const alvo = Math.min(total, Number.isNaN(pedido) ? 0 : Math.max(0, pedido === Infinity ? total : Math.floor(pedido)));
    if (alvo <= 0 || total <= 0) return 0;

    // Rateio proporcional com "maiores restos": nunca tira mais de um atributo do que ele recebeu
    // e a soma bate exatamente com `alvo`.
    const cotas = STATUS_ATRIBUTOS.map((attr) => {
        const exato = (alvo * porAttr[attr]) / total;
        return { attr, pontos: Math.floor(exato), resto: exato - Math.floor(exato) };
    });
    let sobra = alvo - cotas.reduce((s, c) => s + c.pontos, 0);
    [...cotas].sort((a, b) => b.resto - a.resto).forEach((c) => {
        if (sobra > 0 && c.pontos < porAttr[c.attr]) { c.pontos += 1; sobra -= 1; }
    });

    if (!ficha.statusPoolAlocado) ficha.statusPoolAlocado = {};
    let devolvidos = 0;
    cotas.forEach(({ attr, pontos }) => {
        if (pontos <= 0) return;
        const alocado = Math.max(0, num(ficha.statusPoolAlocado[attr]));
        const base = Math.max(0, num(ficha[attr]?.base));
        // Devolver TUDO de um atributo tira exatamente o que ele recebeu (sem resto de arredondamento).
        const reducaoBase = pontos >= porAttr[attr] ? Math.min(alocado, base) : Math.min(pontosParaBase(pontos, div), alocado, base);
        if (reducaoBase <= 0) return;
        if (!ficha[attr]) ficha[attr] = {};
        ficha[attr].base = base - reducaoBase;
        ficha.statusPoolAlocado[attr] = alocado - reducaoBase;
        devolvidos += pontos;
    });

    ficha.statusPoolGasto = Math.max(0, num(ficha.statusPoolGasto) - devolvidos);
    ficha.statusPool = Math.max(0, num(ficha.statusPool)) + devolvidos;
    return devolvidos;
}

// Prevê (sem mutar) o que mudar o Prestígio de Status para `novoPrestigio` vai fazer — usado pela
// UI pra pedir confirmação antes de recolher pontos já distribuídos.
export function planejarAjustePrestigioStatus(ficha, novoPrestigio, ascensaoAtual) {
    const asc = Math.max(1, num(ascensaoAtual) || 1);
    const aplicadoAntes = num(ficha?.statusPrestigioAplicado);
    const credito = (num(novoPrestigio) - aplicadoAntes) * STATUS_ATRIBUTOS.length * asc;
    const poolLivre = Math.max(0, num(ficha?.statusPool));
    const faltaNoPool = credito < 0 ? Math.max(0, -(poolLivre + credito)) : 0;
    const totalAlocado = getTotalPontosAlocados(ficha);
    const aRecolher = Math.min(faltaNoPool, totalAlocado);
    return { credito, poolLivre, aRecolher, semOrigem: faltaNoPool - aRecolher };
}

// Aplica a mudança do Prestígio de Status (muta o rascunho Immer). Credita/debita
// delta * 8 * ascensaoAtual pontos; se o pool livre não cobrir uma redução, recolhe dos atributos
// o que faltar. Se nem assim cobrir (base que não veio do pool), reduz só o que der — igual ao
// comportamento antigo — e devolve `semOrigem` > 0 pra UI avisar.
export function aplicarAjustePrestigioStatus(ficha, novoPrestigio, ascensaoAtual) {
    if (!ficha) return { semOrigem: 0, recolhidos: 0 };
    const asc = Math.max(1, num(ascensaoAtual) || 1);
    const plano = planejarAjustePrestigioStatus(ficha, novoPrestigio, asc);
    const recolhidos = plano.aRecolher > 0 ? recolherPontosAlocados(ficha, plano.aRecolher) : 0;

    const aplicadoAntes = num(ficha.statusPrestigioAplicado);
    const poolAntes = Math.max(0, num(ficha.statusPool));
    const poolDepois = Math.max(0, poolAntes + plano.credito);
    const creditoReal = poolDepois - poolAntes;
    ficha.statusPool = poolDepois;
    ficha.statusPrestigioAplicado = aplicadoAntes + (creditoReal / (STATUS_ATRIBUTOS.length * asc));
    return { semOrigem: Math.max(0, -(poolAntes + plano.credito)), recolhidos };
}
