// Constantes compartilhadas entre PoderesPanel, ArsenalPanel e FormasEditor
export const ATRIBUTOS_AGRUPADOS = [
    {
        label: 'STATUS BASE',
        options: ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao']
    },
    {
        label: 'VITAIS & ENERGIAS',
        options: ['vida', 'mana', 'aura', 'chakra', 'corpo']
    },
    {
        label: 'COMBATE',
        options: ['dano']
    },
    {
        label: 'DEFESA (CA)',
        options: ['evasiva', 'resistencia']
    },
    {
        label: 'ESPECIAIS (GLOBAIS)',
        options: ['todos_status', 'todas_energias', 'geral', 'especial']
    },
    // 🛡️ Redução de Dano (core/reducaoDano.js): use a propriedade BASE; o valor é a % de redução
    // (20 = -20% do dano). Cada redução é aplicada em sequência, uma de cada vez.
    {
        label: '🛡️ REDUÇÃO DE DANO',
        options: ['reducao_dano']
    },
    // ⚡ Ações de Turno (core/acoes.js): use a propriedade BASE; o valor é quantas a mais. Ganhar AÇÃO
    // também dá +1 Ação Bônus e +1 Reação; Bônus e Reação não dão Ação. Teto de 5 de cada.
    {
        label: '⚡ AÇÕES DE TURNO',
        options: ['acao_padrao', 'acao_bonus', 'acao_reacao']
    },
    // 👁️ Percepção/Ocultação de Poder (core/percepcaoPoder.js): use a propriedade BASE; o valor é em
    // pontos. PERCEPCAO_PODER estreita a estimativa do Poder dos outros; OCULTACAO_PODER libera ao
    // dono esconder o próprio Poder (o Assassino já nasce com 100).
    {
        label: '👁️ PERCEPÇÃO DE PODER',
        options: ['percepcao_poder', 'ocultacao_poder']
    }
];

export const PROPRIEDADE_OPTIONS = [
    'base', 'mbase', 'mgeral', 'mformas', 'mabs', 'munico', 'furia_berserker', 'reducaocusto', 'regeneracao', 'elemento_inato', 'bonus_acerto'
];

// ↩️ Reações (core/reacoes.js): a capacidade de reagir é um EFEITO da técnica, ao lado dos demais (Poder Direto, passivas...).
// O ATRIBUTO diz QUANDO a Reação pode ser usada e a PROPRIEDADE diz O QUE ela faz; o valor é a % (reduzir_dano) ou o +N (aumentar_ca).
export const GRUPO_REACOES = {
    label: '↩️ REAÇÕES (quando usar)',
    options: ['reacao_errou', 'reacao_acertou', 'reacao_sempre', 'reacao_aliado']
};
export const PROPRIEDADES_REACAO = ['contra_ataque', 'atacar_atacante', 'atacar_ataque', 'reduzir_dano', 'aumentar_ca'];

// Atributos que só fazem sentido com a propriedade BASE (o valor é a quantidade/porcentagem).
const SO_BASE = new Set(['reducao_dano', 'acao_padrao', 'acao_bonus', 'acao_reacao', 'percepcao_poder', 'ocultacao_poder']);

// Propriedades que fazem sentido para o atributo escolhido (Ação/Reação não têm Multiplicador; Reação escolhe o efeito).
export function getPropriedadesDoAtributo(atributo) {
    const a = String(atributo || '');
    if (a.startsWith('reacao_')) return PROPRIEDADES_REACAO;
    if (SO_BASE.has(a)) return ['base'];
    return PROPRIEDADE_OPTIONS;
}

// Mantém a propriedade atual se ela vale para o atributo; senão cai na primeira opção válida.
export function ajustarPropriedade(atributo, propriedadeAtual) {
    const opcoes = getPropriedadesDoAtributo(atributo);
    return opcoes.includes(propriedadeAtual) ? propriedadeAtual : opcoes[0];
}
