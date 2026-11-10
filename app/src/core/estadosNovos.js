// ==========================================
// 🧪 ESTADOS NOVOS (ficha do Natsu) — dados declarativos. Cada estado tem `efeito(stacks)` que devolve SÓ blocos que o motor já
// entende (core/condicoes.js os soma em modificadoresDeEstados): nada de código por estado nos consumidores (Acerto, Defesa,
// Testes, Turno, Ações). Este módulo NÃO importa nada (condicoes.js importa daqui).
//
// Chaves de `efeito(s)` (todas opcionais; ausente = neutro):
//   implica: ['lento'|'imobilizado'|'incapacitado'|'vulneravel']  cadeia: o estado "puxa" outro (mesma conta do existente)
//   exaustao: níveis de Exaustão somados (como Sangrando a cada 3 stacks)
//   desvTestes / desvAtaque: desvantagens (dados extras, ficam com o menor) em todo teste / em todo ataque
//   desvAtr: { atributo: n }  desvantagens só em testes daquele atributo (forca, destreza, constituicao, sabedoria, carisma...)
//   vantContra: vantagens que quem ATACA este alvo ganha (soma com a de Imobilizado/Incapacitado, máximo 2)
//   evasiva / resistencia / mov / cura: multiplicadores (1 = nada) de Evasiva, Resistência, deslocamento e Cura
//   semMov: true = 0 de deslocamento
//   custoDefesa: acréscimo (fração) no custo de Energia para se defender (0.1 = +10%)
//   perde: { padrao, bonus, reacao }  Ações que o portador PERDE no começo do turno (99 = todas daquele tipo)
//   perdeTurno: true = perde Ação, Ação Bônus e Reação do turno
//   nota: frase fixa extra para a ficha (regras que o Mestre aplica à mão)
// `dano`: { qtd, faces } por stack no começo do turno do portador (entra em DANO_POR_TURNO).
// `suposicao`: true = regra INVENTADA para o estado (sem texto na ficha do Natsu): revisar. `inspiracao`: de onde veio a conta.
// ==========================================

const maxN = (...v) => Math.max(...v);
const TODAS = 99;

export const ESTADOS_NOVOS = [
    {
        id: 'paralisado', nome: 'Paralisado', icone: '⚡', cor: '#ffee00', suposicao: false,
        desc: '• Fica Imobilizado (0 de movimento, desvantagem em Força/Destreza, atacantes com vantagem).\n• Perde Ação, Ação Bônus e Reação no turno.\n• 3+ stacks: dupla vantagem para quem o ataca.',
        inspiracao: 'Imobilizado (puxado inteiro) + perda do turno. É o degrau acima de Imobilizado, que ainda age.',
        efeito: (s) => ({ implica: ['imobilizado'], perdeTurno: true, vantContra: s >= 3 ? 1 : 0 })
    },
    {
        id: 'atordoado', nome: 'Atordoado', icone: '💫', cor: '#ffbb33', suposicao: true,
        desc: '• Perde a Ação e a Reação no turno (2+ stacks: perde também a Ação Bônus).\n• Metade da Evasiva e desvantagem em testes.\n• Quem o ataca tem vantagem.',
        inspiracao: 'Incapacitado, mas mais leve: ainda se move e mantém as Formas; perde as ações em vez de cair inerte.',
        efeito: (s) => ({ perde: { padrao: TODAS, reacao: TODAS, bonus: s >= 2 ? TODAS : 0 }, evasiva: 0.5, desvTestes: 1, vantContra: 1 })
    },
    {
        id: 'emchoque', nome: 'Em choque', icone: '😵', cor: '#cc66ff', suposicao: true,
        desc: '• Perde a Reação; 4+ stacks perde também a Ação Bônus.\n• 1 desvantagem em testes e, com 2+ stacks, em ataques (3 com 4+).\n• Evasiva a 75%.',
        inspiracao: 'Exausto (desvantagens graduais) + Atordoado (perde ações), mas só a parte reativa no começo.',
        efeito: (s) => ({ perde: { reacao: TODAS, bonus: s >= 4 ? TODAS : 0 }, desvTestes: 1, desvAtaque: s >= 4 ? 2 : (s >= 2 ? 1 : 0), evasiva: 0.75 })
    },
    {
        id: 'caido', nome: 'Caído', icone: '🧎', cor: '#a07840', suposicao: true,
        desc: '• Deslocamento pela metade (levantar custa metade do movimento).\n• 1 desvantagem em ataques.\n• Quem o ataca tem vantagem.',
        inspiracao: 'Lento (metade do movimento) + Imobilizado (vantagem contra), sem zerar nada.',
        efeito: () => ({ mov: 0.5, desvAtaque: 1, vantContra: 1 })
    },
    {
        id: 'agarrado', nome: 'Agarrado', icone: '🫳', cor: '#b0805a', suposicao: true,
        desc: '• 0 de deslocamento.\n• Desvantagem em Destreza e em ataques; metade da Evasiva.\n• Sem vantagem para quem o ataca.\n• 3+ stacks: fica Imobilizado.',
        inspiracao: 'Imobilizado mais fraco: preso a alguém, não a uma corrente; só 3+ stacks (agarre firme) o tornam Imobilizado de vez.',
        efeito: (s) => ({ semMov: true, desvAtr: { destreza: 1 }, desvAtaque: 1, evasiva: 0.5, implica: s >= 3 ? ['imobilizado'] : [] })
    },
    {
        id: 'impedido', nome: 'Impedido', icone: '🕸️', cor: '#9aa0a6', suposicao: true,
        desc: '• Deslocamento a 25%.\n• Desvantagem em Destreza e em ataques; Evasiva a 75%.\n• 4+ stacks: fica Imobilizado.',
        inspiracao: 'Degrau entre Lento e Imobilizado: o movimento é travado, mas não zerado, e atacantes não ganham vantagem.',
        efeito: (s) => ({ mov: 0.25, desvAtr: { destreza: 1 }, desvAtaque: 1, evasiva: 0.75, implica: s >= 4 ? ['imobilizado'] : [] })
    },
    {
        id: 'fraco', nome: 'Fraco', icone: '🪫', cor: '#c9a66b', suposicao: true,
        desc: '• Desvantagem em testes de Força (2 com 3+ stacks).\n• 2+ stacks: 1 desvantagem em ataques.\n(Dano causado reduzido: o motor não tem; fica com o Mestre.)',
        inspiracao: 'Vulnerável (desvantagem em Força) e Exausto 3 (desvantagem em ataques), em escada por stack.',
        parcial: 'Não reduz o dano causado (o motor não tem esse bloco).',
        efeito: (s) => ({ desvAtr: { forca: s >= 3 ? 2 : 1 }, desvAtaque: s >= 2 ? 1 : 0 })
    },
    {
        id: 'debilitado', nome: 'Debilitado', icone: '🦴', cor: '#8fa3b8', suposicao: true,
        desc: '• Desvantagem em Força; 2+ stacks: também em Constituição.\n• Resistência reduzida em 15% por stack (mínimo 25%).\n• 3+ stacks: 1 desvantagem em ataques; 4+: 1 desvantagem em testes.',
        inspiracao: 'Vulnerável (corta a Resistência), mas gradual por stack ("debilitado x2" aparece na ficha); Fraco com corpo todo.',
        efeito: (s) => ({ desvAtr: { forca: 1, constituicao: s >= 2 ? 1 : 0 }, resistencia: maxN(0.25, 1 - 0.15 * s), desvAtaque: s >= 3 ? 1 : 0, desvTestes: s >= 4 ? 1 : 0 })
    },
    {
        id: 'adoecido', nome: 'Adoecido', icone: '🤒', cor: '#7fbf7f', suposicao: true,
        desc: '• Cura multiplicada por 75% por stack (também a Regeneração).\n• Desvantagem em Constituição; 2+ stacks: desvantagem em testes.\n• A cada 4 stacks soma 1 nível de Exaustão.',
        inspiracao: 'Cortes de cura de Sangrando/Queimado (mas mais suave) + cadeia para Exaustão como o Sangrando, sem dano por turno (é o que o separa de Envenenado).',
        efeito: (s) => ({ cura: Math.pow(0.75, s), desvAtr: { constituicao: 1 }, desvTestes: s >= 2 ? 1 : 0, exaustao: Math.floor(s / 4) })
    },
    {
        id: 'enjoado', nome: 'Enjoado', icone: '🤮', cor: '#a8c400', suposicao: true,
        desc: '• 1 desvantagem em testes.\n• 2+ stacks: 1 desvantagem em ataques.\n• 3+ stacks: perde 1 Ação Bônus por turno.',
        inspiracao: 'Exausto 1 e 3 (desvantagem em testes e ataques) sem chegar a Lento; o "vômito" custa a Ação Bônus.',
        efeito: (s) => ({ desvTestes: 1, desvAtaque: s >= 2 ? 1 : 0, perde: { bonus: s >= 3 ? 1 : 0 } })
    },
    {
        id: 'sufocado', nome: 'Sufocado', icone: '🫁', cor: '#4488cc', suposicao: true,
        desc: '• 4d4 de dano por stack no começo do turno.\n• Desvantagem em testes e em Constituição.\n• A cada 2 stacks soma 1 nível de Exaustão.',
        inspiracao: 'Dano por stack de Envenenado/Criogenia (4d4) + cadeia de Exaustão do Sangrando, mais rápida (a cada 2 stacks).',
        dano: { qtd: 4, faces: 4 },
        efeito: (s) => ({ desvTestes: 1, desvAtr: { constituicao: 1 }, exaustao: Math.floor(s / 2) })
    },
    {
        id: 'eletrizado', nome: 'Eletrizado', icone: '🔌', cor: '#33ddff', suposicao: false,
        desc: '• 6d4 de dano elétrico por stack no começo do turno.\n• Deslocamento a 75%.\n• 3+ stacks: 1 desvantagem em ataques; 6 stacks: fica Imobilizado (espasmo).',
        inspiracao: 'Queimado/Criogenia: dano por stack no turno + perda de movimento ("perde 3 m de deslocamento", ficha C-38). Os valores são aproximados.',
        dano: { qtd: 6, faces: 4 },
        efeito: (s) => ({ mov: 0.75, desvAtaque: s >= 3 ? 1 : 0, implica: s >= 6 ? ['imobilizado'] : [] })
    },
    {
        id: 'intimidado', nome: 'Intimidado', icone: '😨', cor: '#b184e0', suposicao: true,
        desc: '• 1 desvantagem em ataques e em testes de Carisma (3+ stacks: também Sabedoria).\n• Evita confrontar a fonte do medo (o Mestre aplica).',
        inspiracao: 'Amedrontado mais fraco: o Amedrontado só tem regra narrativa; o Intimidado soma um custo numérico leve e não obriga a fugir.',
        efeito: (s) => ({ desvAtaque: 1, desvAtr: { carisma: 1, sabedoria: s >= 3 ? 1 : 0 } })
    },
    {
        id: 'apavorado', nome: 'Apavorado', icone: '😱', cor: '#7a1fd1', suposicao: true,
        desc: '• Perde Ação, Ação Bônus e Reação (só consegue se afastar da fonte do medo).\n• 2 desvantagens em ataques, 1 em testes; Evasiva a 75%.',
        inspiracao: 'Amedrontado mais forte (ficha D-104: "intimidado e apavorado, perde o turno até passar"): pânico tira o turno inteiro, mas não o movimento.',
        efeito: () => ({ perdeTurno: true, desvAtaque: 2, desvTestes: 1, evasiva: 0.75 })
    },
    {
        id: 'banido', nome: 'Banido', icone: '🌌', cor: '#4a3a7a', suposicao: true,
        desc: '• Fora do plano: não age (perde todas as ações) nem se move.\n• 1 desvantagem em testes.\n(Impedir que seja alvo: o motor não tem; fica com o Mestre.)',
        inspiracao: 'Paralisado/Incapacitado: fora de combate. Use duração em turnos para o retorno.',
        parcial: 'Não impede ser escolhido como alvo (o motor não tem esse bloco).',
        efeito: () => ({ perdeTurno: true, semMov: true, desvTestes: 1, nota: 'Fora deste plano: não pode ser alvo (o Mestre aplica).' })
    },
    {
        id: 'dilacerante', nome: 'Dilacerante', icone: '🩻', cor: '#d94a6a', suposicao: true,
        desc: '• Cura multiplicada por 75% por stack.\n• Resistência reduzida em 10% por stack (mínimo 50%).\n• Defender custa +5% de Energia por stack.',
        inspiracao: 'Sangrando sem o dano por turno: a ferida aberta corta a cura e o corpo perde a firmeza (como Vulnerável, mas gradual).',
        efeito: (s) => ({ cura: Math.pow(0.75, s), resistencia: maxN(0.5, 1 - 0.1 * s), custoDefesa: 0.05 * s })
    },
    {
        id: 'dolorido', nome: 'Dolorido', icone: '🤕', cor: '#ff7a7a', suposicao: true,
        desc: '• 1 desvantagem em testes; 2+ stacks: também em ataques.\n• Defender custa +10% de Energia por stack.\n• 4+ stacks: perde a Reação.',
        inspiracao: 'Exausto 1/3 e o custo de defesa de Queimado/Sangrando, sem dano nem corte de cura.',
        efeito: (s) => ({ desvTestes: 1, desvAtaque: s >= 2 ? 1 : 0, custoDefesa: 0.1 * s, perde: { reacao: s >= 4 ? TODAS : 0 } })
    },
    {
        id: 'inconsciente', nome: 'Inconsciente', icone: '💤', cor: '#555577', suposicao: false,
        desc: '• Fica Incapacitado (sem Formas, dupla vantagem para atacantes, 0 de movimento, Evasiva zerada).\n• Perde Ação, Ação Bônus e Reação.\n• 1 desvantagem em testes (não percebe nada).',
        inspiracao: 'Incapacitado (puxado inteiro) + perda do turno. Degrau acima do Incapacitado, que no motor não tira ações.',
        efeito: () => ({ implica: ['incapacitado'], perdeTurno: true, desvTestes: 1 })
    },
    {
        id: 'cego', nome: 'Cego', icone: '🕶️', cor: '#cccccc', suposicao: false,
        desc: '• 2 desvantagens em ataques e 1 em testes.\n• Quem o ataca tem vantagem.\n(Cego/Surdo antigo continua como estava: 1 desv. em testes, 2 em ataques.)',
        inspiracao: 'Cego/Surdo existente (mesmos números de acerto/testes) + vantagem para quem ataca, já que o alvo não vê o golpe.',
        efeito: () => ({ desvAtaque: 2, desvTestes: 1, vantContra: 1 })
    },
    {
        id: 'surdo', nome: 'Surdo', icone: '🔇', cor: '#9a9a9a', suposicao: true,
        desc: '• Desvantagem em testes de Sabedoria (percepção); 3+ stacks: 1 desvantagem em todos os testes.\n• 2+ stacks: Evasiva a 75% (não ouve o golpe chegar).',
        inspiracao: 'Metade do Cego/Surdo antigo: sem penalidade de acerto, só percepção e reação.',
        efeito: (s) => ({ desvAtr: { sabedoria: 1 }, desvTestes: s >= 3 ? 1 : 0, evasiva: s >= 2 ? 0.75 : 1 })
    }
];

export const IDS_ESTADOS_NOVOS = ESTADOS_NOVOS.map(e => e.id);
const POR_ID = new Map(ESTADOS_NOVOS.map(e => [e.id, e]));
export const definicaoEstadoNovo = (id) => POR_ID.get(id) || null;

// Soma (desvantagens), multiplica (mults) ou une (implica) o efeito de CADA estado novo da lista [{ id, stacks }].
export function somarEfeitosNovos(condicoes) {
    const acc = {
        implica: new Set(), exaustao: 0, desvTestes: 0, desvAtaque: 0, desvAtr: {}, vantContra: 0,
        evasiva: 1, resistencia: 1, mov: 1, cura: 1, semMov: false, custoDefesa: 0,
        perde: { padrao: 0, bonus: 0, reacao: 0 }, perdeTurno: false, notas: []
    };
    (condicoes || []).forEach((c) => {
        const def = POR_ID.get(c.id);
        if (!def) return;
        const ef = def.efeito(c.stacks);
        (ef.implica || []).forEach(i => acc.implica.add(i));
        acc.exaustao += ef.exaustao || 0;
        acc.desvTestes += ef.desvTestes || 0;
        acc.desvAtaque += ef.desvAtaque || 0;
        Object.keys(ef.desvAtr || {}).forEach((a) => { if (ef.desvAtr[a] > 0) acc.desvAtr[a] = (acc.desvAtr[a] || 0) + ef.desvAtr[a]; });
        acc.vantContra += ef.vantContra || 0;
        acc.evasiva *= ef.evasiva === undefined ? 1 : ef.evasiva;
        acc.resistencia *= ef.resistencia === undefined ? 1 : ef.resistencia;
        acc.mov *= ef.mov === undefined ? 1 : ef.mov;
        acc.cura *= ef.cura === undefined ? 1 : ef.cura;
        if (ef.semMov) acc.semMov = true;
        acc.custoDefesa += ef.custoDefesa || 0;
        ['padrao', 'bonus', 'reacao'].forEach((t) => { acc.perde[t] = Math.max(acc.perde[t], (ef.perde && ef.perde[t]) || 0); });
        if (ef.perdeTurno) acc.perdeTurno = true;
        if (ef.nota) acc.notas.push(ef.nota);
    });
    return acc;
}

const pct = (m) => `${Math.round(m * 100)}%`;

// Frase curta do que UM estado novo faz com `stacks` (gerada do próprio `efeito`, a mesma conta que o motor usa).
export function descreverEfeitoNovo(id, stacks, fonte = '') {
    const def = POR_ID.get(id);
    if (!def) return '';
    const ef = def.efeito(stacks);
    const p = [];
    if (ef.perdeTurno) p.push('perde Ação, Ação Bônus e Reação');
    else if (ef.perde) {
        const nomes = { padrao: 'Ação', bonus: 'Ação Bônus', reacao: 'Reação' };
        const l = ['padrao', 'bonus', 'reacao'].filter(t => ef.perde[t] > 0).map(t => (ef.perde[t] >= TODAS ? nomes[t] : `${ef.perde[t]} ${nomes[t]}`));
        if (l.length) p.push(`perde ${l.join(' e ')}`);
    }
    if (ef.semMov) p.push('0 de deslocamento'); else if (ef.mov !== undefined && ef.mov < 1) p.push(`deslocamento a ${pct(ef.mov)}`);
    if (ef.evasiva !== undefined && ef.evasiva < 1) p.push(`Evasiva a ${pct(ef.evasiva)}`);
    if (ef.resistencia !== undefined && ef.resistencia < 1) p.push(`Resistência a ${pct(ef.resistencia)}`);
    if (ef.cura !== undefined && ef.cura < 1) p.push(`cura a ${pct(ef.cura)}`);
    if (ef.custoDefesa > 0) p.push(`defender custa +${Math.round(ef.custoDefesa * 100)}% de Energia`);
    if (ef.desvAtaque > 0) p.push(`${ef.desvAtaque} desvantagem(ns) em ataques`);
    if (ef.desvTestes > 0) p.push(`${ef.desvTestes} desvantagem(ns) em testes`);
    Object.keys(ef.desvAtr || {}).filter(a => ef.desvAtr[a] > 0).forEach(a => p.push(`${ef.desvAtr[a]} desvantagem(ns) em ${a}`));
    if (ef.vantContra > 0) p.push(`quem ataca ganha ${ef.vantContra} vantagem(ns)`);
    if (ef.exaustao > 0) p.push(`soma ${ef.exaustao} nível(is) de Exaustão`);
    if ((ef.implica || []).length) p.push(`conta como ${ef.implica.join(' e ')}`);
    if (def.dano) p.push(`${def.dano.qtd * stacks}d${def.dano.faces} de dano no começo do turno`);
    if (ef.nota) p.push(ef.nota);
    if (fonte && ['intimidado', 'apavorado'].includes(id)) p.push(`o medo vem de ${fonte}`);
    return `${def.icone} ${def.nome}${stacks > 1 ? ` ${stacks}x` : ''}: ${p.join(', ') || 'sem efeito automático'}.`;
}
