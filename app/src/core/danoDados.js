// ==========================================
// 🎲 DADOS DE DANO EXTRAS — lógica pura, sem imports (efeitos-constants, combos e suporte podem importar este arquivo sem ciclo).
//
//  • `dano_dados` (efeito): bônus de DADO no dano ROLADO do golpe do portador. Valor "20d6" ou { qtd, faces }; propriedade sempre 'base';
//    aceita `quando` (core/efeitosCondicionais.js). Multiplicadores NÃO multiplicam esse dano (continuam só no Poder).
//  • `dadosExtra` (campo da Habilidade/Técnica): [{ qtd, faces }] outros tipos de dado rolados junto com os dados principais da fonte
//    (ex.: 100d4 + 25d10 = dadosQtd 100 / dadosFaces 4 + dadosExtra [{ qtd: 25, faces: 10 }]).
//  • `statusFatores` (campo da Habilidade/Técnica): { atributo: N } soma N x o valor EXIBIDO do atributo.
//
// ⚠️ GARANTIA DE ESCOPO: `statusFatores` vale SÓ no cálculo do DANO. Ele é lido em um único lugar (core/engine.js > calcularDano, via
// `fatoresDaFonte`) e NUNCA vira bônus do atributo na ficha: não entra em CA, testes, Poder Calculado, custos, Acerto nem CD.
// Nenhuma outra função deve ler esse campo (a varredura do código-fonte por "statusFatores" deve achar só o engine, este módulo e os que gravam/validam o campo).
// ==========================================

export const LIMITES_DANO_DADOS = {
    qtdMax: 1000,       // dados por termo
    facesMax: 1000,     // faces por dado
    gruposExtra: 8,     // tipos de dado extra por fonte
    totalEfeitos: 1000, // soma de dados vindos de efeitos `dano_dados` num mesmo golpe
    fatorMax: 1000,     // N máximo em "N x atributo"
};

export const ATRIBUTO_DANO_DADOS = 'dano_dados';

// Atributos (status) que o dano aceita, na grafia das chaves da ficha.
export const ATRIBUTOS_DE_DANO = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];

const arred = (n) => Math.round(n * 10000) / 10000;

// "20d6" | "20 D 6" | { qtd, faces } -> { qtd, faces } (inteiros, qtd 1..qtdMax, faces 1..facesMax) ou null.
export function lerDadoDeDano(valor) {
    let qtd; let faces;
    if (typeof valor !== 'string' && typeof valor !== 'number' && !(valor && typeof valor === 'object')) return null; // boolean/undefined não valem
    if (valor && typeof valor === 'object') {
        qtd = Number(valor.qtd);
        faces = Number(valor.faces);
    } else {
        const m = /^\s*(\d{1,6})\s*d\s*(\d{1,6})\s*$/i.exec(String(valor ?? ''));
        if (!m) return null;
        qtd = Number(m[1]);
        faces = Number(m[2]);
    }
    if (!Number.isInteger(qtd) || !Number.isInteger(faces)) return null;
    if (qtd < 1 || qtd > LIMITES_DANO_DADOS.qtdMax || faces < 1 || faces > LIMITES_DANO_DADOS.facesMax) return null;
    return { qtd, faces };
}

export const formatarDadoDeDano = (d) => `${d.qtd}d${d.faces}`;

// Valor de efeito `dano_dados` em forma canônica ("20d6") ou '' se inválido.
export function normalizarValorDanoDados(valor) {
    const d = lerDadoDeDano(valor);
    return d ? formatarDadoDeDano(d) : '';
}

// Lista de { qtd, faces } válida (inválidos saem), com o limite de tipos. Devolve { lista, descartados }.
export function normalizarDadosExtra(bruto) {
    const entrada = Array.isArray(bruto) ? bruto : [];
    const lista = [];
    entrada.forEach((item) => {
        const d = lerDadoDeDano(item);
        if (d) lista.push(d);
    });
    const mantidos = lista.slice(0, LIMITES_DANO_DADOS.gruposExtra);
    return { lista: mantidos, descartados: entrada.length - mantidos.length };
}

// { atributo: N } válido: só atributos de ATRIBUTOS_DE_DANO (chave sem diferença de maiúscula), N finito, >= 1 e <= fatorMax (fator menor que 1 é descartado). Devolve { fatores, descartados }.
export function normalizarStatusFatores(bruto) {
    const fatores = {};
    let descartados = 0;
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return { fatores, descartados };
    Object.keys(bruto).forEach((chave) => {
        const atributo = ATRIBUTOS_DE_DANO.find(a => a.toLowerCase() === String(chave).trim().toLowerCase());
        const n = typeof bruto[chave] === 'number' ? bruto[chave] : parseFloat(String(bruto[chave] ?? '').replace(',', '.'));
        if (!atributo || !Number.isFinite(n) || n < 1 || n > LIMITES_DANO_DADOS.fatorMax) { descartados++; return; }
        fatores[atributo] = arred(n);
    });
    return { fatores, descartados };
}

// Reduz a lista de dados de efeitos (na ordem) até a soma de dados caber no limite total do golpe.
export function limitarDadosDeEfeitos(lista, limite = LIMITES_DANO_DADOS.totalEfeitos) {
    let restante = limite;
    const saida = [];
    (lista || []).forEach((d) => {
        if (restante <= 0) return;
        const qtd = Math.min(d.qtd, restante);
        restante -= qtd;
        saida.push({ ...d, qtd });
    });
    return saida;
}

// ÚNICO ponto de leitura dos fatores de uma fonte de dano (ver o aviso no topo). `fonte` = a Habilidade/Técnica já normalizada.
export function fatoresDaFonte(fonte) {
    return normalizarStatusFatores(fonte && fonte.statusFatores).fatores;
}

// Dados extras de uma fonte, já validados.
export function dadosExtraDaFonte(fonte) {
    return normalizarDadosExtra(fonte && fonte.dadosExtra).lista;
}

// Texto curto "100d4 + 25d10 + 3xDestreza" para resumos.
export function resumirFormulaDeDano({ dadosQtd, dadosFaces, dadosExtra, statusFatores } = {}) {
    const partes = [];
    if (Number(dadosQtd) > 0) partes.push(`${Number(dadosQtd)}d${Number(dadosFaces) || 20}`);
    normalizarDadosExtra(dadosExtra).lista.forEach(d => partes.push(formatarDadoDeDano(d)));
    const { fatores } = normalizarStatusFatores(statusFatores);
    Object.keys(fatores).forEach(a => partes.push(`${fatores[a]}x${a}`));
    return partes.join(' + ');
}

// Dado de um efeito vindo de fora (IA, importador): o campo `dado` ("20d6") tem prioridade sobre `valor`, que também aceita "20d6" ou { qtd, faces }.
export const dadoDoEfeito = (e) => (e && e.dado !== undefined && e.dado !== null && e.dado !== '' ? e.dado : (e ? e.valor : undefined));
