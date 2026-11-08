// ==========================================
// 🎓 PROFICIÊNCIA POR ENERGIA — a ficha pode ter Proficiência diferente por energia (ex.: +5 em Mana/Aura e +2 em
// Chakra/Corpo). Campo opcional da ficha: `proficienciaPorEnergia = { mana?, aura?, chakra?, corpo? }` (números >= 0).
// Ausente, vazio ou sem a energia do golpe = vale a `proficienciaBase` de sempre (comportamento idêntico ao antigo).
//
// O Acerto não escolhe energia (só Atributos), então a energia do golpe é: a informada pelo chamador; senão a da arma
// equipada com % de energia (ficha.ataqueConfig.armaEnergiaCombustao); senão a do primeiro Poder ativo que gasta energia.
// ==========================================
export const ENERGIAS_PROFICIENCIA = ['mana', 'aura', 'chakra', 'corpo'];
const ROTULO = { mana: 'Mana', aura: 'Aura', chakra: 'Chakra', corpo: 'Corpo' };

export function rotuloEnergiaProficiencia(energia) {
    return ROTULO[energia] || String(energia || '');
}

// Só energias válidas com número >= 0; devolve {} se nada serve.
export function normalizarProficienciaPorEnergia(obj) {
    const saida = {};
    if (!obj || typeof obj !== 'object') return saida;
    ENERGIAS_PROFICIENCIA.forEach(e => {
        const bruto = obj[e];
        if (bruto === undefined || bruto === null || bruto === '') return;
        const n = parseInt(bruto, 10);
        if (Number.isFinite(n) && n >= 0) saida[e] = n;
    });
    return saida;
}

function energiaValida(e) {
    const k = String(e || '').trim().toLowerCase();
    return ENERGIAS_PROFICIENCIA.includes(k) ? k : null;
}

// Energia do golpe quando o chamador não a informa (ver cabeçalho). null = desconhecida.
export function energiaDoGolpe(ficha, explicita) {
    const direta = energiaValida(explicita);
    if (direta) return direta;
    if (!ficha || typeof ficha !== 'object') return null;
    const cfg = ficha.ataqueConfig;
    if (cfg && (parseFloat(cfg.armaPercEnergia) || 0) > 0) {
        const e = energiaValida(cfg.armaEnergiaCombustao);
        if (e) return e;
    }
    const poderes = Array.isArray(ficha.poderes) ? ficha.poderes : [];
    for (const p of poderes) {
        if (p && p.ativa && (parseFloat(p.custoPercentual) || 0) > 0) {
            const e = energiaValida(p.energiaCombustao);
            if (e) return e;
        }
    }
    return null;
}

// { valor, energia }: `energia` só vem preenchida quando a Proficiência por energia foi quem decidiu o valor.
export function resolverProficienciaPorEnergia(ficha, profBase, energiaExplicita) {
    const base = Number(profBase) || 0;
    const tabela = normalizarProficienciaPorEnergia(ficha && ficha.proficienciaPorEnergia);
    if (Object.keys(tabela).length === 0) return { valor: base, energia: null };
    const energia = energiaDoGolpe(ficha, energiaExplicita);
    if (!energia || tabela[energia] === undefined) return { valor: base, energia: null };
    return { valor: tabela[energia], energia };
}

// Aplica o que foi digitado em UMA energia e devolve a tabela nova (ou undefined se ficou vazia: o campo some da ficha).
export function atualizarProficienciaPorEnergia(atual, energia, digitado) {
    if (!ENERGIAS_PROFICIENCIA.includes(energia)) return normalizarProficienciaPorEnergia(atual);
    const tabela = normalizarProficienciaPorEnergia(atual);
    const n = parseInt(digitado, 10);
    if (digitado === '' || digitado === null || digitado === undefined || !Number.isFinite(n) || n < 0) delete tabela[energia];
    else tabela[energia] = n;
    return Object.keys(tabela).length > 0 ? tabela : undefined;
}
