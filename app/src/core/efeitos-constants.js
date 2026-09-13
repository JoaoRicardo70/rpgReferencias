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
    }
];

export const PROPRIEDADE_OPTIONS = [
    'base', 'mbase', 'mgeral', 'mformas', 'mabs', 'munico', 'furia_berserker', 'reducaocusto', 'regeneracao', 'elemento_inato', 'bonus_acerto'
];