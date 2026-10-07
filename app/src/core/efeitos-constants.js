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